import assert from 'node:assert/strict';
import {clientPurchaseReport,validBirthday,birthdayInDays,birthdayAlerts,eligibleBirthdayEmail} from '../src/client-insights.mjs';
const orders=[
 {clientId:'a',number:'1',createdAt:'2026-11-10T12:00:00Z',total:7000,items:[{productId:'c',product:'Churros',qty:2,price:3000},{productId:'b',product:'Brownie',qty:1,price:1000}]},
 {clientId:'a',number:'2',createdAt:'2026-11-16T12:00:00Z',total:4000,items:[{productId:'c',product:'Churros',qty:1,price:4000}]},
 {clientId:'b',total:99999,items:[{product:'Otro',qty:1,price:99999}]},
 {clientId:'a',canceled:true,total:5000,items:[{product:'No contar',qty:1,price:5000}]}
];
const r=clientPurchaseReport(orders,'a');
assert.equal(r.orders,2);assert.equal(r.total,11000);assert.equal(r.units,4);assert.equal(r.average,5500);
assert.equal(r.products[0].name,'Churros');assert.equal(r.products[0].units,3);assert.equal(r.products[0].orders,2);
assert.equal(clientPurchaseReport(orders,'sin').orders,0);
assert.equal(validBirthday('2024-02-29'),'2024-02-29');assert.equal(validBirthday('2025-02-29'),'');
assert.equal(birthdayInDays('1988-11-19','2026-11-19'),0);
assert.equal(birthdayInDays('1988-11-20','2026-11-19'),1);
assert.equal(birthdayInDays('2000-02-29','2027-02-28'),0);
assert.equal(birthdayAlerts([{name:'A',birthday:'2000-11-19'},{name:'B',birthday:'2000-12-20'}],'2026-11-19').length,1);
assert.equal(eligibleBirthdayEmail({birthday:'2000-11-19',email:'a@b.cl',birthdayEmailConsent:false},'2026-11-19'),false);
assert.equal(eligibleBirthdayEmail({birthday:'2000-11-19',email:'a@b.cl',birthdayEmailConsent:true},'2026-11-19'),true);
console.log('Informe y cumpleaños: pruebas de agrupación, fechas y consentimiento correctas.');
