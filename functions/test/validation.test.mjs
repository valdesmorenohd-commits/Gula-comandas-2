import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orderInput,paymentInput,adjustmentInput,idempotencyKey,inventoryKey,computeTotal} from '../validation.mjs';
test('normalizar pedido suma líneas repetidas',()=>{
 const order=orderInput({customer:'Cliente prueba',deliveryDate:'2026-11-23',deliveryWindow:'18-20',notes:'',
 items:[{productId:'producto1',quantity:2},{productId:'producto1',quantity:3}]});
 assert.equal(order.items.length,1);
 assert.equal(order.items[0].quantity,5);
});
test('rechaza cantidades incorrectas y ausencia de productos',()=>{
 assert.throws(()=>orderInput({customer:'Cliente',deliveryDate:'2026-11-23',items:[]}));
 assert.throws(()=>orderInput({customer:'Cliente',deliveryDate:'2026-11-23',items:[{productId:'producto1',quantity:-1}]}));
});
test('los totales se calculan en el servidor y son enteros',()=>{
 assert.equal(computeTotal([{price:4000,quantity:2},{price:2500,quantity:1}]),10500);
 assert.throws(()=>computeTotal([{price:1e20,quantity:2}]));
});
test('los pagos no aceptan montos negativos, cero ni medio inventado',()=>{
 assert.deepEqual(paymentInput({amount:5000,method:'tef'}),{amount:5000,method:'tef'});
 assert.throws(()=>paymentInput({amount:-500,method:'efectivo'}));
 assert.throws(()=>paymentInput({amount:300,method:'bitcoin'}));
});
test('ajustes exigen motivo y fecha válida',()=>{
 assert.deepEqual(adjustmentInput({productId:'producto1',delta:2,reason:'Compra de insumos'}).delta,2);
 assert.throws(()=>adjustmentInput({productId:'producto1',delta:2,reason:''}));
});
test('existencias permanentes y por fecha usan claves distintas',()=>{
 assert.notEqual(inventoryKey('producto1','2026-11-23','dated'),inventoryKey('producto1','2026-11-24','dated'));
 assert.equal(inventoryKey('producto1','2026-11-23','permanent'),inventoryKey('producto1','2026-11-24','permanent'));
});
test('peticiones duplicadas comparten clave de idempotencia',()=>{
 assert.equal(idempotencyKey('req_abcdef12345'),'req_abcdef12345');
 assert.throws(()=>idempotencyKey('../peligro'));
});
