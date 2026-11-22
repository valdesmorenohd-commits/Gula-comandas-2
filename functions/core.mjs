// Núcleo transaccional aislado, apto para comprobarse en emulador sin desplegar Functions.
import {FieldValue} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {orderInput,paymentInput,adjustmentInput,cancellationInput,refundInput,cashMovementInput,closingInput,summarizeCashRows,localChileDay,idempotencyKey,inventoryKey,computeTotal} from './validation.mjs';
export function createSalesCore(db){
 const businessId='gula',base=db.collection('businesses').doc(businessId);
 const forbidden=msg=>{throw new Error(msg)};
 const defaults={
 principal_admin:new Set(['orders.create','orders.cancel','payments.record','refunds.record','inventory.adjust','cash.manage','cash.close']),
 personal:new Set(['orders.create','payments.record','inventory.adjust','cash.manage']),
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
function priceFromProduct(product,choice){
 const price=Number(product?.price);
 if(!Number.isSafeInteger(price)||price<0||price>10000000)throw Error('Precio del producto incorrecto');
 const options=Array.isArray(product.options)?product.options:[];
 if(!options.length){
  if(choice)throw Error('La opción seleccionada no existe');
  return price;
 }
 const option=options.find(o=>o&&o.name===choice);
 if(!option)throw Error('Selecciona una opción válida del catálogo');
 const extra=Number(option.extra);
 if(!Number.isSafeInteger(extra)||extra<0||extra>1000000)throw Error('Recargo de producto inválido');
 return price+extra;
}

 async function createSaleOrder(uid,data){
 const key=idempotencyKey(data?.idempotencyKey);
 const input=orderInput(data);
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
   return {...line,name:product.name,price:priceFromProduct(product,line.option),
     stockMode:product.stockMode==='dated'?'dated':'permanent'};
  }));
  // Las opciones Manjar/Nutella del mismo producto comparten existencias:
  // primero sumar unidades por referencia de inventario, luego descontar una vez.
  const required=new Map();
  for(const p of products){
   const key=inventoryKey(p.productId,input.deliveryDate,p.stockMode);
   const group=required.get(key)||{key,name:p.name,quantity:0};
   group.quantity+=p.quantity;
   required.set(key,group);
  }
  const inventoryRows=await Promise.all([...required.values()].map(async group=>{
   const ref=base.collection('inventory').doc(group.key);
   const snap=await tx.get(ref);
   if(!snap.exists)throw Error('No hay stock configurado para '+group.name);
   const available=Number(snap.data().quantity);
   if(!Number.isSafeInteger(available)||available<group.quantity)
    throw Error('Stock insuficiente para '+group.name);
   return {ref,available,quantity:group.quantity};
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
   items:products.map(p=>({productId:p.productId,name:p.name,option:p.option,quantity:p.quantity,price:p.price,stockMode:p.stockMode})),
   total,paidTotal:0,refundedTotal:0,refundDue:0,balance:total,paymentStatus:'pending',status:'open',
   createdBy:uid,updatedBy:uid,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  tx.set(opRef,{uid,kind:'createSaleOrder',result,createdAt:FieldValue.serverTimestamp()});
  tx.set(auditRef,{kind:'order.created',uid,orderId:orderRef.id,number,total,at:FieldValue.serverTimestamp()});
  return result;
 });
}

async function recordSalePayment(uid,data){
 const key=idempotencyKey(data?.idempotencyKey);
 const orderId=cleanDocumentId(data?.orderId,'Comanda');
 const {amount,method}=paymentInput(data);
 const orderRef=base.collection('orders').doc(orderId),opRef=operationRef(uid,key,'recordSalePayment');
 const day=localChileDay(),closureRef=base.collection('cashClosures').doc(day);
 const cashRef=base.collection('cashEntries').doc(),auditRef=base.collection('audit').doc();
 return db.runTransaction(async tx=>{
  await memberActor(tx,uid,'payments.record');
  const op=await tx.get(opRef);
  if(op.exists)return op.data().result;
  const closure=await tx.get(closureRef);
  if(closure.exists)throw Error('La caja de hoy está cerrada');
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
  tx.set(cashRef,{businessId,kind:'payment',direction:'in',category:'Pago de comanda',day,orderId,number:o.number,amount,method,
   createdAt:FieldValue.serverTimestamp(),createdBy:uid});
  tx.set(opRef,{uid,kind:'recordSalePayment',result,createdAt:FieldValue.serverTimestamp()});
  tx.set(auditRef,{kind:'order.payment',uid,orderId,amount,method,at:FieldValue.serverTimestamp()});
  return result;
 });
}

async function adjustSaleInventory(uid,data){
 const key=idempotencyKey(data?.idempotencyKey);
 const {productId,date,delta,reason}=adjustmentInput(data);
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
}

async function cancelSaleOrder(uid,data){
 const key=idempotencyKey(data?.idempotencyKey);
 const orderId=cleanDocumentId(data?.orderId,'Comanda');
 const {reason}=cancellationInput(data);
 const ref=base.collection('orders').doc(orderId),opRef=operationRef(uid,key,'cancelSaleOrder');
 const auditRef=base.collection('audit').doc();
 return db.runTransaction(async tx=>{
  await memberActor(tx,uid,'orders.cancel');
  const existing=await tx.get(opRef);
  if(existing.exists)return existing.data().result;
  const snap=await tx.get(ref);
  if(!snap.exists)throw Error('Comanda inexistente');
  const order=snap.data();
  if(order.status!=='open')throw Error('La comanda no puede anularse');
  if(!Array.isArray(order.items)||!order.items.length)throw Error('Productos de comanda inválidos');
  const itemsToRestore=new Map();
  for(const item of order.items){
   const inventoryId=inventoryKey(item.productId,order.deliveryDate,item.stockMode);
   if(!Number.isSafeInteger(item.quantity)||item.quantity<1)throw Error('Cantidad de comanda incorrecta');
   const group=itemsToRestore.get(inventoryId)||{inventoryId,name:item.name,quantity:0};
   group.quantity+=item.quantity;
   itemsToRestore.set(inventoryId,group);
  }
  const reservations=[];
  for(const group of itemsToRestore.values()){
   const invRef=base.collection('inventory').doc(group.inventoryId);
   const inv=await tx.get(invRef);
   if(!inv.exists)throw Error('No se encontró inventario para liberar '+group.name);
   const current=Number(inv.data().quantity);
   if(!Number.isSafeInteger(current)||current<0)throw Error('Existencias inconsistentes');
   const next=current+group.quantity;
   if(!Number.isSafeInteger(next)||next>100000)throw Error('Stock resultante fuera de rango');
   reservations.push({ref:invRef,current,next});
  }
  const paid=Number(order.paidTotal||0),refunded=Number(order.refundedTotal||0);
  if(!Number.isSafeInteger(paid)||!Number.isSafeInteger(refunded)||paid<refunded)
   throw Error('Pagos de comanda inconsistentes');
  const refundDue=paid-refunded;
  for(const item of reservations){
   tx.update(item.ref,{quantity:item.next,updatedAt:FieldValue.serverTimestamp(),updatedBy:uid});
  }
  tx.update(ref,{status:'canceled',cancelReason:reason,canceledBy:uid,canceledAt:FieldValue.serverTimestamp(),
   refundDue,balance:0,updatedAt:FieldValue.serverTimestamp(),updatedBy:uid});
  const result={orderId,status:'canceled',refundDue,restoredStock:true};
  tx.set(opRef,{uid,kind:'cancelSaleOrder',result,createdAt:FieldValue.serverTimestamp()});
  tx.set(auditRef,{kind:'order.canceled',uid,orderId,number:order.number,reason,refundDue,
   at:FieldValue.serverTimestamp()});
  return result;
 });
}

async function recordSaleRefund(uid,data){
 const key=idempotencyKey(data?.idempotencyKey);
 const orderId=cleanDocumentId(data?.orderId,'Comanda');
 const {amount,method}=refundInput(data);
 const orderRef=base.collection('orders').doc(orderId),opRef=operationRef(uid,key,'recordSaleRefund');
 const day=localChileDay(),closureRef=base.collection('cashClosures').doc(day);
 const cashRef=base.collection('cashEntries').doc(),auditRef=base.collection('audit').doc();
 return db.runTransaction(async tx=>{
  await memberActor(tx,uid,'refunds.record');
  const previous=await tx.get(opRef);
  if(previous.exists)return previous.data().result;
  const closure=await tx.get(closureRef);
  if(closure.exists)throw Error('La caja de hoy está cerrada');
  const snap=await tx.get(orderRef);
  if(!snap.exists)throw Error('Comanda inexistente');
  const order=snap.data();
  if(order.status!=='canceled')throw Error('Primero debe anularse la comanda');
  const paid=Number(order.paidTotal||0),refunded=Number(order.refundedTotal||0);
  if(!Number.isSafeInteger(paid)||!Number.isSafeInteger(refunded)||refunded<0||refunded>paid)
   throw Error('Importes inconsistentes');
  if(amount>paid-refunded)throw Error('La devolución supera el importe pendiente');
  const refundedTotal=refunded+amount,refundDue=paid-refundedTotal;
  const result={orderId,refundedTotal,refundDue};
  tx.update(orderRef,{refundedTotal,refundDue,updatedAt:FieldValue.serverTimestamp(),updatedBy:uid});
  tx.set(cashRef,{businessId,kind:'refund',direction:'out',category:'Devolución de comanda',
   day,orderId,number:order.number,amount,method,createdAt:FieldValue.serverTimestamp(),createdBy:uid});
  tx.set(opRef,{uid,kind:'recordSaleRefund',result,createdAt:FieldValue.serverTimestamp()});
  tx.set(auditRef,{kind:'order.refund',uid,orderId,amount,method,at:FieldValue.serverTimestamp()});
  return result;
 });
}

async function recordCashMovement(uid,data){
 const key=idempotencyKey(data?.idempotencyKey);
 const {direction,category,note,amount,method}=cashMovementInput(data);
 const cashRef=base.collection('cashEntries').doc();
 const opRef=operationRef(uid,key,'recordCashMovement'),auditRef=base.collection('audit').doc();
 const day=localChileDay(),closureRef=base.collection('cashClosures').doc(day);
 return db.runTransaction(async tx=>{
  await memberActor(tx,uid,'cash.manage');
  const previous=await tx.get(opRef);
  if(previous.exists)return previous.data().result;
  const closure=await tx.get(closureRef);
  if(closure.exists)throw Error('La caja de hoy está cerrada');
  const result={id:cashRef.id,direction,category,amount,method};
  tx.set(cashRef,{businessId,kind:'manual',direction,category,note,day,
   amount,method,createdAt:FieldValue.serverTimestamp(),createdBy:uid});
  tx.set(opRef,{uid,kind:'recordCashMovement',result,createdAt:FieldValue.serverTimestamp()});
  tx.set(auditRef,{kind:'cash.movement',uid,movementId:cashRef.id,direction,category,amount,method,
   at:FieldValue.serverTimestamp()});
  return result;
 });
}


async function cashDaySnapshot(tx,day,openingCash){
 const cashQuery=base.collection('cashEntries').where('day','==',day).limit(1001);
 const ordersQuery=base.collection('orders').where('deliveryDate','==',day).limit(1001);
 const cashSnapshot=await tx.get(cashQuery);
 const ordersSnapshot=await tx.get(ordersQuery);
 if(cashSnapshot.size>1000||ordersSnapshot.size>1000)
  throw Error('Demasiadas operaciones para cerrar este día automáticamente');
 const movements=cashSnapshot.docs.map(doc=>({id:doc.id,...doc.data()}));
 const pending=ordersSnapshot.docs.filter(doc=>{
  const o=doc.data();
  return o.status==='open'&&Number(o.balance)>0;
 }).map(doc=>({id:doc.id,number:doc.data().number,customer:doc.data().customer,
  balance:Number(doc.data().balance)}));
 const totals=summarizeCashRows(movements,openingCash);
 return {day,totals,movementCount:movements.length,pendingCount:pending.length,
   pendingAmount:pending.reduce((sum,o)=>sum+o.balance,0),pending};
}
async function previewCashDay(uid,data){
 const {day,openingCash}=closingInput(data);
 return db.runTransaction(async tx=>{
  await memberActor(tx,uid,'cash.close');
  const closure=await tx.get(base.collection('cashClosures').doc(day));
  if(closure.exists)return {closed:true,...closure.data()};
  return {closed:false,...await cashDaySnapshot(tx,day,openingCash)};
 });
}
async function closeCashDay(uid,data){
 const key=idempotencyKey(data?.idempotencyKey);
 const {day,openingCash,physicalCash,pendingReviewed}=closingInput(data);
 if(day>localChileDay())throw Error('No puedes cerrar una fecha futura');
 const closureRef=base.collection('cashClosures').doc(day);
 const opRef=operationRef(uid,key,'closeCashDay'),auditRef=base.collection('audit').doc();
 return db.runTransaction(async tx=>{
  await memberActor(tx,uid,'cash.close');
  const previous=await tx.get(opRef);
  if(previous.exists)return previous.data().result;
  const closed=await tx.get(closureRef);
  if(closed.exists)throw Error('Ese día ya tiene un cierre registrado');
  const snapshot=await cashDaySnapshot(tx,day,openingCash);
  if(snapshot.pendingCount>0&&!pendingReviewed)
   throw Error('Debes revisar las comandas pendientes antes de cerrar caja');
  const result={day,openingCash,physicalCash,...snapshot,
   difference:physicalCash===null?null:physicalCash-snapshot.totals.expectedCash};
  tx.set(closureRef,{...result,closedBy:uid,closedAt:FieldValue.serverTimestamp(),schemaVersion:1});
  tx.set(opRef,{uid,kind:'closeCashDay',result,createdAt:FieldValue.serverTimestamp()});
  tx.set(auditRef,{kind:'cash.closed',uid,day,pendingCount:snapshot.pendingCount,
   totalCash:snapshot.totals.cashNet,totalTef:snapshot.totals.tefNet,
   at:FieldValue.serverTimestamp()});
  return result;
 });
}

 return {createSaleOrder,recordSalePayment,adjustSaleInventory,cancelSaleOrder,recordSaleRefund,recordCashMovement,previewCashDay,closeCashDay};
}
