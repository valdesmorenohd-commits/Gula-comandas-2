import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportCsv} from '../cloud-report-export.mjs';
const full={
 from:'2026-11-01',to:'2026-11-24',dateType:'delivery',
 partialOrders:false,partialCash:false,
 activeCount:2,canceled:1,sales:12000,receivable:3000,refundPending:500,
 payments:9000,refunds:500,cashIn:6000,cashOut:1200,tefIn:3000,tefOut:0,
 withdrawals:200,expenses:1000,
 products:[{name:'Churros',units:3,total:12000}],
 byDay:[{day:'2026-11-24',orders:2,total:12000}]
};
test('CSV del período incluye importes en CLP y tablas de productos',()=>{
 const csv=reportCsv(full,{showCash:true});
 assert.match(csv,/^\ufeff/);
 assert.match(csv,/Churros/);
 assert.match(csv,/12000/);
 assert.match(csv,/Ingresos efectivo/);
 assert.match(csv,/2026-11-24/);
 assert.match(csv,/\r\n/);
});
test('personal no recibe información de caja en exportación',()=>{
 const csv=reportCsv(full,{showCash:false});
 assert.doesNotMatch(csv,/Ingresos efectivo/);
 assert.match(csv,/Ventas en comandas seleccionadas/);
});
test('bloquea hojas incompletas y caracteres que ejecutan fórmulas en Excel',()=>{
 assert.throws(()=>reportCsv({...full,partialOrders:true}),/informe parcial/);
 assert.throws(()=>reportCsv({...full,partialCash:true}),/informe parcial/);
 const csv=reportCsv({...full,products:[{name:'=HYPERLINK("evil")',units:1,total:1000}]});
 assert.match(csv,/'=HYPERLINK/);
 assert.match(csv,/""evil""/);
});
