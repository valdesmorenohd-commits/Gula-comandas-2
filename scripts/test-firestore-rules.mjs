/**
 * Pruebas para el EMULADOR de Firestore. No se conecta a Firebase real.
 * Ejecutar exclusivamente con FIRESTORE_EMULATOR_HOST mediante el comando documentado.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,collection,getDocs} from 'firebase/firestore';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'No ejecutar fuera del emulador de Firestore');
const projectId='gula2-rules-local-test';
const rules=readFileSync(new URL('../firebase/firestore.readonly-preview.rules',import.meta.url),'utf8');
const env=await initializeTestEnvironment({projectId,firestore:{rules}});
const document=(db,path)=>doc(db,...path.split('/'));
let passed=0;
async function check(label,expectation,promise){
 await (expectation==='allow'?assertSucceeds(promise):assertFails(promise));
 console.log('OK '+label);passed++;
}
try {
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  for(const [uid,role,active,biz] of [
   ['admin','principal_admin',true,'gula'],
   ['staff','personal',true,'gula'],
   ['viewer','consulta',true,'gula'],
   ['inactive','personal',false,'gula'],
   ['other','principal_admin',true,'another']
  ])await setDoc(document(db,`businesses/${biz}/members/${uid}`),{uid,businessId:biz,active,roleId:role});
  for(const biz of ['gula','another']){
   for(const [path,payload] of [
    ['orders/demo-1',{number:'DEMO-1'}],
    ['products/product-1',{name:'Prueba'}],
    ['clients/client-1',{name:'Prueba'}],
    ['cashEvents/event-1',{amount:100}],
    ['settings/general',{brand:'GULA'}],
    ['orders/demo-1/payments/p1',{amount:100}]
   ])await setDoc(document(db,`businesses/${biz}/${path}`),payload);
  }
 });
 const db=(uid)=>env.authenticatedContext(uid).firestore();
 const anon=env.unauthenticatedContext().firestore();
 const docPath=(suffix,biz='gula')=>`businesses/${biz}/${suffix}`;
 await check('anónimo no lee productos','deny',getDoc(document(anon,docPath('products/product-1'))));
 await check('sin membresía no lee pedidos','deny',getDoc(document(db('stranger'),docPath('orders/demo-1'))));
 await check('miembro inactivo no lee pedidos','deny',getDoc(document(db('inactive'),docPath('orders/demo-1'))));
 await check('usuario de otra empresa no lee Gula','deny',getDoc(document(db('other'),docPath('orders/demo-1'))));
 await check('administrador lee pedidos','allow',getDoc(document(db('admin'),docPath('orders/demo-1'))));
 await check('personal lee pedidos','allow',getDoc(document(db('staff'),docPath('orders/demo-1'))));
 await check('consulta lee pedidos','allow',getDoc(document(db('viewer'),docPath('orders/demo-1'))));
 await check('consulta puede listar productos','allow',getDocs(collection(db('viewer'),docPath('products'))));
 await check('consulta no lee datos personales de clientes','deny',getDoc(document(db('viewer'),docPath('clients/client-1'))));
 await check('personal sí lee clientes','allow',getDoc(document(db('staff'),docPath('clients/client-1'))));
 await check('consulta no lee ajustes globales','deny',getDoc(document(db('viewer'),docPath('settings/general'))));
 await check('admin lee ajustes globales','allow',getDoc(document(db('admin'),docPath('settings/general'))));
 await check('usuario lee solo su membresía','allow',getDoc(document(db('viewer'),docPath('members/viewer'))));
 await check('usuario no lee membresía ajena','deny',getDoc(document(db('viewer'),docPath('members/admin'))));
 await check('cliente no crea su membresía','deny',setDoc(document(db('stranger'),docPath('members/stranger')),{uid:'stranger',active:true,roleId:'principal_admin',businessId:'gula'}));
 await check('admin no modifica roles desde web','deny',setDoc(document(db('admin'),docPath('members/viewer')),{uid:'viewer',active:true,roleId:'principal_admin',businessId:'gula'}));
 await check('admin no crea pedidos por reglas de solo lectura','deny',setDoc(document(db('admin'),docPath('orders/demo-2')),{number:'DEMO-2'}));
 await check('personal no crea pagos por reglas de solo lectura','deny',setDoc(document(db('staff'),docPath('orders/demo-1/payments/p2')),{amount:1}));
 await check('consulta no crea registros de caja','deny',setDoc(document(db('viewer'),docPath('cashEvents/event-2')),{amount:1}));
 await check('consulta lee pagos de la empresa','allow',getDoc(document(db('viewer'),docPath('orders/demo-1/payments/p1'))));
 console.log(`Superadas ${passed} verificaciones de reglas en emulador. No se tocó el proyecto real.`);
} finally {
 await env.cleanup();
}
