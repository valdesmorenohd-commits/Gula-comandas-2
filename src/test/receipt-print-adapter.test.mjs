import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoOrderForReceipt} from '../receipt-print-adapter.mjs';
import {receiptHtml} from '../cloud-receipts.mjs';
const local={
 number:'DEMO-0007',customer:'María Pérez',delivery:'2026-11-27',deliveryTime:'18:30',
 items:[{productId:'ch1',product:'Churros clásicos',price:4000,qty:2,option:'Manjar'}],
 total:8000,payments:[{amount:2500,method:'Efectivo'}],
 observations:'Sin azúcar adicional'
};
test('adapta una comanda local de Gula a ticket térmico, sin alterar datos',()=>{
 const before=JSON.stringify(local);
 const receipt=demoOrderForReceipt(local);
 assert.equal(JSON.stringify(local),before);
 assert.deepEqual(receipt.items,[{name:'Churros clásicos',quantity:2,price:4000,option:'Manjar'}]);
 assert.equal(receipt.paidTotal,2500);
 assert.equal(receipt.balance,5500);
 assert.equal(receipt.paymentStatus,'partial');
 assert.equal(receipt.printTest,true);
 const html=receiptHtml(receipt,{widthMm:58});
 assert.match(html,/DEMO-0007/);
 assert.match(html,/27-11-2026/);
 assert.match(html,/58mm/);
 assert.match(html,/PRUEBA · NO ES VENTA REAL/);
 assert.match(html,/8\.000/);
 assert.match(html,/5\.500/);
 assert.match(html,/Imprimir \/ Guardar PDF/);
 assert.match(html,/Sin azúcar adicional/);
});
test('comanda anulada se identifica claramente en el ticket',()=>{
 const order=demoOrderForReceipt({...local,canceled:true});
 const html=receiptHtml(order,{widthMm:58});
 assert.match(html,/COMANDA ANULADA/);
 assert.match(html,/Estado de pago: ANULADA/);
});
test('el adaptador impide imprimir totales inconsistentes o cantidades incorrectas',()=>{
 assert.throws(()=>demoOrderForReceipt({...local,items:[{...local.items[0],qty:0}]}),/línea/);
 assert.throws(()=>demoOrderForReceipt({...local,payments:[{amount:9000}]}),/superan/);
 assert.throws(()=>demoOrderForReceipt({...local,total:-1}),/Total/);
});
test('nombres y observaciones de comanda local se escapan en el papel',()=>{
 const receipt=demoOrderForReceipt({...local,customer:'<img src=x>',observations:'<script>alert(1)</script>'});
 const html=receiptHtml(receipt);
 assert.doesNotMatch(html,/<img src=x>/);
 assert.doesNotMatch(html,/<script>alert/);
 assert.match(html,/&lt;img src=x&gt;/);
});
