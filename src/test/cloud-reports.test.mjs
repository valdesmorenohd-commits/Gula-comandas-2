import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSharedReport,dayOf} from '../cloud-reports.mjs';
const orders=[
 {id:'o1',customer:'María',deliveryDate:'2026-11-24',createdAt:'2026-11-22T17:20:00.000Z',
  status:'open',paymentStatus:'partial',total:8000,balance:5000,
  items:[{productId:'p1',name:'Churros',quantity:2,price:4000}]},
 {id:'o2',customer:'Felipe',deliveryDate:'2026-11-24',createdAt:'2026-11-24T10:00:00.000Z',
  status:'open',paymentStatus:'paid',total:3000,balance:0,
  items:[{productId:'p2',name:'Brownie',quantity:3,price:1000}]},
 {id:'o3',customer:'Cliente',deliveryDate:'2026-11-24',createdAt:'2026-11-23T17:00:00.000Z',
  status:'canceled',paymentStatus:'partial',total:4500,balance:0,refundDue:1500,
  items:[{productId:'p1',name:'Churros',quantity:1,price:4500}]}
];
const cashEntries=[
 {day:'2026-11-23',kind:'payment',direction:'in',method:'efectivo',amount:3000},
 {day:'2026-11-24',kind:'payment',direction:'in',method:'tef',amount:3000},
 {day:'2026-11-24',kind:'refund',direction:'out',method:'efectivo',amount:1000},
 {day:'2026-11-24',kind:'manual',direction:'out',method:'efectivo',category:'Compra de insumos',amount:500},
 {day:'2026-11-24',kind:'manual',direction:'out',method:'efectivo',category:'Retiro personal',amount:200}
];
test('ventas por entrega no confunden saldos ni caja por fecha de movimiento',()=>{
 const report=buildSharedReport({orders,cashEntries,from:'2026-11-24',to:'2026-11-24'});
 assert.equal(report.activeCount,2);
 assert.equal(report.canceled,1);
 assert.equal(report.sales,11000);
 assert.equal(report.receivable,5000);
 assert.equal(report.refundPending,1500);
 assert.equal(report.payments,3000);
 assert.equal(report.refunds,1000);
 assert.equal(report.netReceipts,2000);
 assert.equal(report.cashIn,0);
 assert.equal(report.cashOut,1700);
 assert.equal(report.tefIn,3000);
 assert.equal(report.expenses,500);
 assert.equal(report.withdrawals,200);
 assert.equal(report.products[0].total,8000);
 assert.equal(report.byDay.length,1);
});
test('fecha de pedido permite filtrar de forma independiente',()=>{
 const result=buildSharedReport({orders,cashEntries,from:'2026-11-22',to:'2026-11-22',dateType:'created'});
 assert.equal(result.orderCount,1);
 assert.equal(result.sales,8000);
 assert.equal(result.payments,0);
});
test('filtros por cliente, estado y producto no alteran caja del período',()=>{
 const result=buildSharedReport({orders,cashEntries,from:'2026-11-24',to:'2026-11-24',
  customer:'mar',status:'partial',productId:'p1'});
 assert.equal(result.orderCount,1);
 assert.equal(result.sales,8000);
 assert.equal(result.payments,3000);
});
test('cobros en días posteriores a la entrega no se suman al día anterior',()=>{
 const r=buildSharedReport({orders,cashEntries,from:'2026-11-23',to:'2026-11-23'});
 assert.equal(r.orderCount,0);
 assert.equal(r.payments,3000);
 assert.equal(r.sales,0);
});
test('detecta totales de fuente incompleta y no anuncia informe total',()=>{
 const r=buildSharedReport({orders,cashEntries,orderLimit:3,cashLimit:5});
 assert.equal(r.partialOrders,true);
 assert.equal(r.partialCash,true);
});
test('fechas inválidas y montos corruptos se rechazan',()=>{
 assert.throws(()=>buildSharedReport({orders,cashEntries,from:'2026-02-30'}));
 assert.throws(()=>buildSharedReport({orders,cashEntries,from:'2026-11-25',to:'2026-11-24'}));
 assert.throws(()=>buildSharedReport({orders:[{...orders[0],balance:9000}],cashEntries:[]}));
});
test('formato Firestore Timestamp se normaliza a fecha local de Chile',()=>{
 assert.equal(dayOf({seconds:1795521600}),'2026-11-24');
 assert.equal(dayOf('2026-11-24'),'2026-11-24');
});
