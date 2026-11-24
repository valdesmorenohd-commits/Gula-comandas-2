import {test} from 'node:test';
import assert from 'node:assert/strict';
import {receiptHtml} from '../cloud-receipts.mjs';
const order={number:'G-000123',customer:'Cliente Gula',deliveryDate:'2026-11-23',deliveryWindow:'18:00-20:00',
 items:[{productId:'prod01',name:'Churros',quantity:2,price:4000}],total:8000,paidTotal:2500,balance:5500,
 paymentStatus:'partial',notes:'Sin azúcar extra'};
test('comprobante cliente incluye total y saldo',()=>{
 const html=receiptHtml(order);
 assert.match(html,/G-000123/);
 assert.match(html,/8\.000/);
 assert.match(html,/5\.500/);
 assert.match(html,/Abonado/);
 assert.match(html,/58mm/);
});
test('comanda de cocina oculta importes',()=>{
 const html=receiptHtml(order,{type:'kitchen'});
 assert.match(html,/COCINA/);
 assert.doesNotMatch(html,/8\.000/);
 assert.doesNotMatch(html,/5\.500/);
 assert.match(html,/2 × Churros/);
});
test('el texto de clientes y observaciones se escapa',()=>{
 const html=receiptHtml({...order,customer:'<script>alert(1)</script>',notes:'<img src=x onerror=alert(1)>'});
 assert.doesNotMatch(html,/<script>alert/);
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/&lt;script&gt;/);
});
test('permite 80mm y rechaza papel no compatible',()=>{
 assert.match(receiptHtml(order,{widthMm:80}),/80mm/);
 assert.throws(()=>receiptHtml(order,{widthMm:57}));
});

test('el comprobante identifica la opción del producto y evita scripts en esa opción',()=>{
 const html=receiptHtml({...order,items:[{...order.items[0],option:'Nutella<script>alert(1)</script>'}]});
 assert.match(html,/Nutella/);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>alert/);
});
