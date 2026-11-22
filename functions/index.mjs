// Gula Comandas 2.0 - núcleo servidor PREPARADO, NO DESPLEGADO.
// Requiere Firebase Functions (plan Blaze) y pruebas de integración antes de ventas.
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {initializeApp,getApps} from 'firebase-admin/app';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {orderInput,paymentInput,adjustmentInput,idempotencyKey,inventoryKey,computeTotal} from './validation.mjs';

if(!getApps().length)initializeApp();
const db=getFirestore();
const businessId='gula',base=db.collection('businesses').doc(businessId);
const region='southamerica-west1';
const wrap=fn=>onCall({region,maxInstances:5},async request=>{
 try{return await fn(request)}catch(err){
  if(err instanceof HttpsError)throw err;
  console.error('Gula backend error',err?.message||err);
  throw new HttpsError('failed-precondition',String(err?.message||'No se pudo completar la operación').slice(0,220));
 }
});
const forbidden=msg=>{throw new HttpsError('permission-denied',msg)};
function requireUid(request){
 const uid=request.auth?.uid;
 if(!uid)throw new HttpsError('unauthenticated','Inicia sesión para continuar');
 return uid;
}
const defaults={
 principal_admin:new Set(['orders.create','payments.record','inventory.adjust']),
 personal:new Set(['orders.create','payments.record','inventory.adjust']),
 consulta:new Set()
};
async function memberActor(tx,uid,permission){
 const ref=base.collection('members').doc(uid);
 const snap=await tx.get(ref),member=snap.data();
 if(!snap.exists||member.active!==true||member.uid!==uid||member.businessId!==businessId)
  forbidden('No tienes acceso activo a Gula');
 const allowed=defaults[member.roleId]||new Set();
 if(Array.isArray(member.denies)&&member.denies.includes(permission))forbidden('Permiso denegado');
 if(!allowed.has(permission) && !(Array.isArray(member.grants)&&member.grants.includes(permission)))
  forbidden('Tu perfil no puede realizar esta operación');
 return member;
}
function operationRef(uid,key,kind){
 const hash=createHash('sha256').update(uid+':'+kind+':'+key).digest('hex');
 return base.collection('operations').doc(hash);
}
function cleanDocumentId(value,label){
 const v=String(value||'');
 if(!/^[A-Za-z0-9_-]{8,128}$/.test(v))throw Error(label+' inválido');
 return v;
}
function priceFromProduct(product){
 const price=Number(product?.price);
 if(!Number.isSafeInteger(price)||price<0||price>10000000)throw Error('Precio del producto incorrecto');
 return price;
}
export const createSaleOrder=wrap(async request=>{
 const uid=requireUid(request),key=idempotencyKey(request.data?.idempotencyKey);
 const input=orderInput(request.data);
 const orderRef=base.collection('orders').doc(),counterRef=base.collection('counters').doc('orderNumber');
 const opRef=operationRef(uid,key,'createSaleOrder'),auditRef=base.collection('audit').doc();
 return db.runTransaction(async tx=>{
  await memberActor(tx,uid,'orders.create');
  const op=await tx.get(opRef);
  if(op.exists)return op.data().result;
  const products=await Promise.all(input.items.map(async line=>{
   const ref=base.collection('products').doc(line.productId);
   const snap=await tx.get(ref);
   if(!snap.exists||snap.data().active!==true)throw Error('Un producto no está disponible');
   const product=snap.data();
   return {...line,name:product.name,price:priceFromProduct(product),
     stockMode:product.stockMode==='dated'?'dated':'permanent'};
  }));
  const inventoryRows=await Promise.all(products.map(async p=>{
   const ref=base.collection('inventory').doc(inventoryKey(p.productId,input.deliveryDate,p.stockMode));
   const snap=await tx.get(ref);
   if(!snap.exists)throw Error('No hay stock configurado para '+p.name);
   const available=Number(snap.data().quantity);
   if(!Number.isSafeInteger(available)||available<p.quantity)
    throw Error('Stock insuficiente para '+p.name);
   return {ref,available,quantity:p.quantity,productId:p.productId};
  }));
  const numSnap=await tx.get(counterRef);
  const numberValue=Number(numSnap.exists?numSnap.data().value:0)+1;
  if(!Number.isSafeInteger(numberValue)||numberValue>99999999)throw Error('Numeración agotada');
  const total=computeTotal(products);
  const number='G-'+String(numberValue).padStart(6,'0');
  const result={id:orderRef.id,number,total};
  for(const row of inventoryRows){
   tx.update(row.ref,{quantity:row.available-row.quantity,updatedAt:FieldValue.serverTimestamp(),updatedBy:uid});
  }
  tx.set(counterRef,{value:numberValue,updatedAt:FieldValue.serverTimestamp()});
  tx.set(orderRef,{businessId,schemaVersion:1,number,customer:input.customer,
   deliveryDate:input.deliveryDate,deliveryWindow:input.deliveryWindow,notes:input.notes,
   items:products.map(p=>({productId:p.productId,name:p.name,quantity:p.quantity,price:p.price})),
   total,paidTotal:0,balance:total,paymentStatus:'pending',status:'open',
   createdBy:uid,updatedBy:uid,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  tx.set(opRef,{uid,kind:'createSaleOrder',result,createdAt:FieldValue.serverTimestamp()});
  tx.set(auditRef,{kind:'order.created',uid,orderId:orderRef.id,number,total,at:FieldValue.serverTimestamp()});
  return result;
 });
});
export const recordSalePayment=wrap(async request=>{
 const uid=requireUid(request),key=idempotencyKey(request.data?.idempotencyKey);
 const orderId=cleanDocumentId(request.data?.orderId,'Comanda');
 const {amount,method}=paymentInput(request.data);
 const orderRef=base.collection('orders').doc(orderId),opRef=operationRef(uid,key,'recordSalePayment');
 const cashRef=base.collection('cashEntries').doc(),auditRef=base.collection('audit').doc();
 return db.runTransaction(async tx=>{
  await memberActor(tx,uid,'payments.record');
  const op=await tx.get(opRef);
  if(op.exists)return op.data().result;
  const snap=await tx.get(orderRef);
  if(!snap.exists)throw Error('Comanda no encontrada');
  const o=snap.data();
  if(o.status!=='open')throw Error('La comanda no admite nuevos pagos');
  const paid=Number(o.paidTotal||0),total=Number(o.total);
  if(!Number.isSafeInteger(paid)||!Number.isSafeInteger(total)||paid<0||total<=0||paid>total)
   throw Error('Datos de pago inconsistentes');
  if(paid+amount>total)throw Error('El abono supera el saldo pendiente');
  const paidTotal=paid+amount,balance=total-paidTotal;
  const result={orderId,paidTotal,balance,paymentStatus:balance===0?'paid':'partial'};
  tx.update(orderRef,{paidTotal,balance,paymentStatus:result.paymentStatus,
   updatedAt:FieldValue.serverTimestamp(),updatedBy:uid});
  tx.set(cashRef,{businessId,kind:'payment',orderId,number:o.number,amount,method,
   createdAt:FieldValue.serverTimestamp(),createdBy:uid});
  tx.set(opRef,{uid,kind:'recordSalePayment',result,createdAt:FieldValue.serverTimestamp()});
  tx.set(auditRef,{kind:'order.payment',uid,orderId,amount,method,at:FieldValue.serverTimestamp()});
  return result;
 });
});
export const adjustSaleInventory=wrap(async request=>{
 const uid=requireUid(request),key=idempotencyKey(request.data?.idempotencyKey);
 const {productId,date,delta,reason}=adjustmentInput(request.data);
 const productRef=base.collection('products').doc(productId),opRef=operationRef(uid,key,'adjustSaleInventory');
 const auditRef=base.collection('audit').doc();
 return db.runTransaction(async tx=>{
  await memberActor(tx,uid,'inventory.adjust');
  const op=await tx.get(opRef);
  if(op.exists)return op.data().result;
  const productSnap=await tx.get(productRef);
  if(!productSnap.exists)throw Error('Producto inexistente');
  const mode=productSnap.data().stockMode==='dated'?'dated':'permanent';
  if(mode==='dated'&&!date)throw Error('Indica la fecha del stock');
  const inventoryId=inventoryKey(productId,date,mode);
  const ref=base.collection('inventory').doc(inventoryId),snap=await tx.get(ref);
  const prior=snap.exists?Number(snap.data().quantity):0,next=prior+delta;
  if(!Number.isSafeInteger(prior)||!Number.isSafeInteger(next)||next<0||next>100000)
   throw Error('El ajuste dejaría un stock inválido');
  const result={productId,inventoryId,previous:prior,quantity:next};
  tx.set(ref,{businessId,productId,stockMode:mode,stockDate:mode==='dated'?date:null,quantity:next,
   updatedAt:FieldValue.serverTimestamp(),updatedBy:uid});
  tx.set(opRef,{uid,kind:'adjustSaleInventory',result,createdAt:FieldValue.serverTimestamp()});
  tx.set(auditRef,{kind:'inventory.adjusted',uid,productId,inventoryId,previous:prior,quantity:next,delta,reason,
   at:FieldValue.serverTimestamp()});
  return result;
 });
});
