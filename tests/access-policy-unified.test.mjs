import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as frontend from '../src/access-policy.mjs';
import * as backend from '../functions/access-policy.mjs';
const membership=(roleId,grants=[],denies=[],active=true)=>({
 uid:'user01',businessId:'gula',active,roleId,grants,denies
});
const allowed=(policy,member,permission)=>policy.canPerform({
 authUid:'user01',businessId:'gula',membership:member,permission
});
test('frontend y backend comparten política de permisos exactamente',()=>{
 assert.deepEqual(frontend.PERMISSIONS,backend.PERMISSIONS);
 assert.deepEqual(frontend.ROLE_DEFAULTS,backend.ROLE_DEFAULTS);
 for(const role of ['principal_admin','personal','consulta']){
  for(const [permission] of frontend.PERMISSIONS){
   const m=membership(role);
   assert.equal(allowed(frontend,m,permission),allowed(backend,m,permission));
  }
 }
});
test('denegaciones particulares tienen preferencia ante rol y concesiones',()=>{
 const m=membership('personal',['payments.record'],['payments.record']);
 assert.equal(allowed(backend,m,'payments.record'),false);
 assert.equal(allowed(backend,m,'orders.create'),true);
});
test('la consulta solo recibe permiso extra para funciones explícitas, no administración reservada',()=>{
 const m=membership('consulta',['orders.cancel','users.manage','backups.restore']);
 assert.equal(allowed(backend,m,'orders.cancel'),true);
 assert.equal(allowed(backend,m,'users.manage'),false);
 assert.equal(allowed(backend,m,'backups.restore'),false);
});
test('administración principal puede reabrir, el personal puede cerrar, suspendido no opera',()=>{
 assert.equal(allowed(backend,membership('principal_admin'),'orders.reopen'),true);
 assert.equal(allowed(backend,membership('personal'),'orders.close'),true);
 assert.equal(allowed(backend,membership('personal'),'orders.reopen'),false);
 assert.equal(allowed(backend,membership('principal_admin',[],[],false),'orders.create'),false);
});
