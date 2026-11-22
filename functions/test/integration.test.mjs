// Integración real contra Firebase Firestore Emulator (SIN tocar el proyecto Gula).
import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createSalesCore} from '../core.mjs';

if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('La prueba exige FIRESTORE_EMULATOR_HOST');
const app=initializeApp({projectId:'gula-members-test'},'test-sales-core');
const db=getFirestore(app),base=db.collection('businesses').doc('gula');
const service=createSalesCore(db);
const owner='owner-fixture',staff='staff-fixture';
const productId='producto01',request=(key='request_abcdefgh123')=>({
 idempotencyKey:key,customer:'Cliente de prueba',deliveryDate:'2026-11-23',
 deliveryWindow:'18:00-20:00',notes:'Sin modificaciones',
 items:[{productId,quantity:2}]
});
beforeEach(async()=>{
 await db.recursiveDelete(base);
 await base.collection('members').doc(owner).set({uid:owner,businessId:'gula',active:true,roleId:'principal_admin',grants:[],denies:[]});
 await base.collection('members').doc(staff).set({uid:staff,businessId:'gula',active:true,roleId:'personal',grants:[],denies:[]});
 await base.collection('products').doc(productId).set({
  businessId:'gula',name:'Churros',price:4000,active:true,stockMode:'permanent'
 });
 await base.collection('inventory').doc(productId+'__permanent').set({quantity:10});
});
after(async()=>await deleteApp(app));
test('crear comanda genera número, total oficial y descuenta stock',async()=>{
 const result=await service.createSaleOrder(owner,request());
 assert.equal(result.number,'G-000001');
 assert.equal(result.total,8000);
 const snap=await base.collection('orders').doc(result.id).get();
 assert.equal(snap.data().total,8000);
 assert.equal(snap.data().balance,8000);
 assert.equal((await base.collection('inventory').doc(productId+'__permanent').get()).data().quantity,8);
});
test('repetir la misma solicitud no duplica comanda, número ni existencias',async()=>{
 const first=await service.createSaleOrder(owner,request());
 const again=await service.createSaleOrder(owner,request());
 assert.deepEqual(again,first);
 assert.equal((await base.collection('orders').get()).size,1);
 assert.equal((await base.collection('inventory').doc(productId+'__permanent').get()).data().quantity,8);
});
test('abonos incrementales generan movimiento de caja y saldo correcto',async()=>{
 const sale=await service.createSaleOrder(owner,request());
 const payment=await service.recordSalePayment(owner,{orderId:sale.id,idempotencyKey:'pago_abcdefghijkl',amount:2500,method:'efectivo'});
 assert.equal(payment.paidTotal,2500);
 assert.equal(payment.balance,5500);
 await service.recordSalePayment(owner,{orderId:sale.id,idempotencyKey:'pago_abcdefghijkl',amount:2500,method:'efectivo'});
 assert.equal((await base.collection('cashEntries').get()).size,1);
 const final=await service.recordSalePayment(owner,{orderId:sale.id,idempotencyKey:'pago_abcdefghijkl_2',amount:5500,method:'tef'});
 assert.equal(final.balance,0);
 assert.equal(final.paymentStatus,'paid');
 await assert.rejects(()=>service.recordSalePayment(owner,{orderId:sale.id,idempotencyKey:'pago_abcdefghijkl_3',amount:1,method:'tef'}));
});
test('si falta stock, no crea comanda ni altera caja',async()=>{
 await base.collection('inventory').doc(productId+'__permanent').update({quantity:1});
 await assert.rejects(()=>service.createSaleOrder(owner,request()));
 assert.equal((await base.collection('orders').get()).size,0);
 assert.equal((await base.collection('inventory').doc(productId+'__permanent').get()).data().quantity,1);
});
test('stock de fecha es independiente y los ajustes quedan auditados',async()=>{
 await base.collection('products').doc(productId).update({stockMode:'dated'});
 const inventory=await service.adjustSaleInventory(owner,{idempotencyKey:'ajuste_abcdefgh1',productId,date:'2026-11-23',delta:5,reason:'Preparación de fin de semana'});
 assert.equal(inventory.quantity,5);
 const order=await service.createSaleOrder(owner,request());
 assert.equal(order.total,8000);
 assert.equal((await base.collection('inventory').doc(productId+'__2026-11-23').get()).data().quantity,3);
 await assert.rejects(()=>service.createSaleOrder(owner,{...request('request_otradate_abc'),deliveryDate:'2026-11-24'}));
 assert.ok((await base.collection('audit').get()).size>=2);
});
test('miembro suspendido y solo consulta no crean ventas ni cobran',async()=>{
 await base.collection('members').doc(staff).update({active:false});
 await assert.rejects(()=>service.createSaleOrder(staff,request()));
 await base.collection('members').doc(staff).update({active:true,roleId:'consulta'});
 await assert.rejects(()=>service.createSaleOrder(staff,request()));
 const sale=await service.createSaleOrder(owner,request());
 await assert.rejects(()=>service.recordSalePayment(staff,{orderId:sale.id,idempotencyKey:'pago_abcdefghi12',amount:1000,method:'tef'}));
});
test('dos pedidos concurrentes no consumen más stock del disponible',async()=>{
 await base.collection('inventory').doc(productId+'__permanent').update({quantity:3});
 const r=await Promise.allSettled([
  service.createSaleOrder(owner,request('request_concurrent01')),
  service.createSaleOrder(staff,request('request_concurrent02'))
 ]);
 assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(r.filter(x=>x.status==='rejected').length,1);
 assert.equal((await base.collection('inventory').doc(productId+'__permanent').get()).data().quantity,1);
});
