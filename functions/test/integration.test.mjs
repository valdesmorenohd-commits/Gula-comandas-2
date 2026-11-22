// Integración real contra Firebase Firestore Emulator (SIN tocar el proyecto Gula).
import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createSalesCore} from '../core.mjs';
import {localChileDay} from '../validation.mjs';

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

test('anular pedido devuelve stock una sola vez y deja saldo de devolución',async()=>{
 const sale=await service.createSaleOrder(owner,request());
 await service.recordSalePayment(owner,{orderId:sale.id,idempotencyKey:'pago_anular_abcdef',amount:3000,method:'efectivo'});
 const cmd={orderId:sale.id,idempotencyKey:'anular_abcdefgh123',reason:'El cliente canceló el pedido'};
 const first=await service.cancelSaleOrder(owner,cmd);
 assert.equal(first.refundDue,3000);
 assert.equal((await base.collection('inventory').doc(productId+'__permanent').get()).data().quantity,10);
 const again=await service.cancelSaleOrder(owner,cmd);
 assert.deepEqual(again,first);
 assert.equal((await base.collection('inventory').doc(productId+'__permanent').get()).data().quantity,10);
 await assert.rejects(()=>service.cancelSaleOrder(owner,{...cmd,idempotencyKey:'anular_otra_abcdef'}));
 assert.equal((await base.collection('orders').doc(sale.id).get()).data().status,'canceled');
});
test('devolución no supera pagos, se registra aparte y no se duplica',async()=>{
 const sale=await service.createSaleOrder(owner,request());
 await service.recordSalePayment(owner,{orderId:sale.id,idempotencyKey:'pago_devolucion_123',amount:4000,method:'tef'});
 await assert.rejects(()=>service.recordSaleRefund(owner,{orderId:sale.id,idempotencyKey:'refund_antes_12345',amount:1000,method:'tef'}));
 await service.cancelSaleOrder(owner,{orderId:sale.id,idempotencyKey:'cancel_devolucion12',reason:'El cliente no quiere el pedido'});
 const first=await service.recordSaleRefund(owner,{orderId:sale.id,idempotencyKey:'refund_parcial_1234',amount:2000,method:'tef'});
 assert.equal(first.refundDue,2000);
 await service.recordSaleRefund(owner,{orderId:sale.id,idempotencyKey:'refund_parcial_1234',amount:2000,method:'tef'});
 assert.equal((await base.collection('cashEntries').where('kind','==','refund').get()).size,1);
 await assert.rejects(()=>service.recordSaleRefund(owner,{orderId:sale.id,idempotencyKey:'refund_exceso_1234',amount:2001,method:'tef'}));
 const full=await service.recordSaleRefund(owner,{orderId:sale.id,idempotencyKey:'refund_final_12345',amount:2000,method:'efectivo'});
 assert.equal(full.refundDue,0);
 assert.equal((await base.collection('cashEntries').where('kind','==','refund').get()).size,2);
});
test('personal no puede devolver dinero, principal sí',async()=>{
 const sale=await service.createSaleOrder(owner,request());
 await service.recordSalePayment(owner,{orderId:sale.id,idempotencyKey:'pago_ref_admin_123',amount:4000,method:'efectivo'});
 await service.cancelSaleOrder(owner,{orderId:sale.id,idempotencyKey:'anular_ref_admin_123',reason:'Problema con el pedido'});
 await assert.rejects(()=>service.recordSaleRefund(staff,{orderId:sale.id,idempotencyKey:'refund_staff_12345',amount:1000,method:'efectivo'}));
 const result=await service.recordSaleRefund(owner,{orderId:sale.id,idempotencyKey:'refund_owner_12345',amount:1000,method:'efectivo'});
 assert.equal(result.refundDue,3000);
});
test('caja manual exige motivo y nunca duplica reintentos',async()=>{
 const movement={idempotencyKey:'cash_manual_12345',direction:'out',category:'Compra de insumos',note:'Harina',amount:1500,method:'efectivo'};
 const first=await service.recordCashMovement(owner,movement);
 assert.equal(first.amount,1500);
 assert.equal(first.direction,'out');
 assert.deepEqual(await service.recordCashMovement(owner,movement),first);
 assert.equal((await base.collection('cashEntries').get()).size,1);
 assert.equal((await base.collection('audit').get()).size,1);
 await assert.rejects(()=>service.recordCashMovement(owner,{...movement,idempotencyKey:'cash_wrong_12345',category:''}));
});

test('cierre de caja exige revisar comandas pendientes y guarda arqueo',async()=>{
 const day=localChileDay();
 const order=await service.createSaleOrder(owner,{...request('create_today_abcdef123'),deliveryDate:day});
 await service.recordSalePayment(owner,{orderId:order.id,idempotencyKey:'pay_today_abcdef123',amount:2500,method:'efectivo'});
 await service.recordCashMovement(owner,{idempotencyKey:'cashout_today_abc12',direction:'out',category:'Compra de insumos',
   note:'Harina',amount:500,method:'efectivo'});
 const preview=await service.previewCashDay(owner,{day,openingCash:1000});
 assert.equal(preview.closed,false);
 assert.equal(preview.pendingCount,1);
 assert.equal(preview.pendingAmount,5500);
 assert.equal(preview.totals.cashNet,2000);
 assert.equal(preview.totals.expectedCash,3000);
 await assert.rejects(()=>service.closeCashDay(owner,{day,openingCash:1000,physicalCash:3200,
   pendingReviewed:false,idempotencyKey:'close_today_abcdef123'}));
 const input={day,openingCash:1000,physicalCash:3200,pendingReviewed:true,idempotencyKey:'close_today_abcdef123'};
 const result=await service.closeCashDay(owner,input);
 assert.equal(result.difference,200);
 assert.equal(result.pendingCount,1);
 assert.deepEqual(await service.closeCashDay(owner,input),result);
 assert.equal((await base.collection('cashClosures').get()).size,1);
 const after=await service.previewCashDay(owner,{day,openingCash:1000});
 assert.equal(after.closed,true);
 await assert.rejects(()=>service.recordSalePayment(owner,{orderId:order.id,idempotencyKey:'pay_after_close_abc',amount:1000,method:'tef'}));
 await assert.rejects(()=>service.recordCashMovement(owner,{idempotencyKey:'cash_after_close_abc',direction:'in',
   category:'Ingreso adicional',amount:1000,method:'efectivo'}));
});
test('personal no puede cerrar caja ni consultar la previsualización',async()=>{
 const day=localChileDay();
 await assert.rejects(()=>service.previewCashDay(staff,{day,openingCash:0}));
 await assert.rejects(()=>service.closeCashDay(staff,{day,openingCash:0,
   pendingReviewed:true,idempotencyKey:'close_staff_abcdef12'}));
});
