// Ejecutar exclusivamente contra los emuladores locales de Firebase.
// npm run test:rules (instala Java para Firestore Emulator y Node 20+).
import {readFileSync} from 'node:fs';
import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,serverTimestamp,deleteDoc} from 'firebase/firestore';

const PROJECT_ID='gula-members-test';
const BUSINESS='gula', OWNER='owner-fixture', STAFF='staff-fixture', STRANGER='stranger-fixture';
const path=(uid)=>doc(env.authenticatedContext(uid).firestore(),'businesses',BUSINESS,'members',uid);
const memberDoc=(db,uid)=>doc(db,'businesses',BUSINESS,'members',uid);
const collectionRef=(db)=>collection(db,'businesses',BUSINESS,'members');
const basic=(uid,roleId,{active=true,updatedBy=OWNER}={})=>({
 uid,businessId:BUSINESS,name:uid===OWNER?'Administrador':'Personal de Gula',
 email:uid+'@example.test',roleId,active,grants:[],denies:[],
 updatedBy,updatedAt:new Date('2026-11-22T12:00:00Z')
});
let env;
before(async()=>{
 env=await initializeTestEnvironment({
  projectId:PROJECT_ID,
  firestore:{rules:readFileSync(new URL('../firebase/firestore.rules',import.meta.url),'utf8')}
 });
});
after(async()=>{if(env)await env.cleanup()});
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  await setDoc(memberDoc(db,OWNER),basic(OWNER,'principal_admin'));
  await setDoc(memberDoc(db,STAFF),basic(STAFF,'personal'));
 });
});

test('no autenticado no puede leer ni listar',async()=>{
 const db=env.unauthenticatedContext().firestore();
 await assertFails(getDoc(memberDoc(db,OWNER)));
 await assertFails(getDocs(collectionRef(db)));
});

test('personal lee su membresía, no la de administrador ni lista',async()=>{
 const db=env.authenticatedContext(STAFF).firestore();
 await assertSucceeds(getDoc(memberDoc(db,STAFF)));
 await assertFails(getDoc(memberDoc(db,OWNER)));
 await assertFails(getDocs(collectionRef(db)));
});

test('administrador lee y lista membresías',async()=>{
 const db=env.authenticatedContext(OWNER).firestore();
 await assertSucceeds(getDoc(memberDoc(db,STAFF)));
 const results=await assertSucceeds(getDocs(collectionRef(db)));
 assert.equal(results.size,2);
});

test('sin membresía no tiene acceso a fichas ajenas',async()=>{
 const db=env.authenticatedContext(STRANGER).firestore();
 await assertFails(getDoc(memberDoc(db,STAFF)));
 await assertFails(getDocs(collectionRef(db)));
});

test('personal no puede modificar cuentas ni elevarse a principal',async()=>{
 const db=env.authenticatedContext(STAFF).firestore();
 await assertFails(updateDoc(memberDoc(db,OWNER),{active:false,updatedAt:serverTimestamp(),updatedBy:STAFF}));
 await assertFails(updateDoc(memberDoc(db,STAFF),{roleId:'principal_admin',updatedAt:serverTimestamp(),updatedBy:STAFF}));
});

test('administrador no puede modificar su propia membresía',async()=>{
 const db=env.authenticatedContext(OWNER).firestore();
 await assertFails(updateDoc(memberDoc(db,OWNER),{active:false,updatedAt:serverTimestamp(),updatedBy:OWNER}));
});

test('administrador puede suspender y reactivar al personal con serverTimestamp',async()=>{
 const db=env.authenticatedContext(OWNER).firestore();
 await assertSucceeds(updateDoc(memberDoc(db,STAFF),{active:false,updatedAt:serverTimestamp(),updatedBy:OWNER}));
 const suspended=await getDoc(memberDoc(db,STAFF));
 assert.equal(suspended.data().active,false);
 const suspendedDb=env.authenticatedContext(STAFF).firestore();
 await assertFails(getDoc(memberDoc(suspendedDb,OWNER)));
 await assertSucceeds(updateDoc(memberDoc(db,STAFF),{active:true,updatedAt:serverTimestamp(),updatedBy:OWNER}));
 const restored=await getDoc(memberDoc(db,STAFF));
 assert.equal(restored.data().active,true);
});

test('suspendido no puede listar ni editar usuarios',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore();
   await updateDoc(memberDoc(db,OWNER),{active:false});
 });
 const db=env.authenticatedContext(OWNER).firestore();
 await assertFails(getDocs(collectionRef(db)));
 await assertFails(updateDoc(memberDoc(db,STAFF),{active:false,updatedAt:serverTimestamp(),updatedBy:OWNER}));
});

test('administrador no puede asignar otro principal ni borrar usuarios',async()=>{
 const db=env.authenticatedContext(OWNER).firestore();
 await assertFails(updateDoc(memberDoc(db,STAFF),{roleId:'principal_admin',updatedAt:serverTimestamp(),updatedBy:OWNER}));
 await assertFails(deleteDoc(memberDoc(db,STAFF)));
});

test('administrador puede crear membresía de personal, no una de principal',async()=>{
 const db=env.authenticatedContext(OWNER).firestore();
 const newUid='newstaff-fixture';
 const newStaff={...basic(newUid,'personal'),updatedBy:OWNER,updatedAt:serverTimestamp()};
 await assertSucceeds(setDoc(memberDoc(db,newUid),newStaff));
 await assertFails(setDoc(memberDoc(db,'other-admin-fixture'),{
  ...basic('other-admin-fixture','principal_admin'),updatedAt:serverTimestamp()
 }));
});

test('miembros activos pueden consultar borradores, pero no acceder a caja',async()=>{
 for(const uid of [OWNER,STAFF]){
  const db=env.authenticatedContext(uid).firestore();
  await assertSucceeds(getDoc(doc(db,'businesses',BUSINESS,'draftOrders','test-order')));
  await assertFails(getDoc(doc(db,'businesses',BUSINESS,'cashEntries','test-cash')));
 }
});

test('personal autenticado puede crear solo borrador de comanda pendiente',async()=>{
 const db=env.authenticatedContext(STAFF).firestore();
 const collectionOrders=collection(db,'businesses',BUSINESS,'draftOrders');
 const good={
  businessId:BUSINESS,schemaVersion:1,customer:'Cliente ejemplo',
  deliveryDate:'2026-11-23',deliveryWindow:'18:00-20:00',
  items:[{name:'Churros',qty:1}],notes:'',status:'open',paymentStatus:'pending',
  createdBy:STAFF,updatedBy:STAFF,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
 };
 await assertSucceeds(setDoc(doc(collectionOrders,'draft-ok'),good));
 await assertSucceeds(getDoc(doc(collectionOrders,'draft-ok')));
 await assertFails(setDoc(doc(collectionOrders,'draft-paid'),{...good,paymentStatus:'paid'}));
 await assertFails(setDoc(doc(collectionOrders,'draft-fake'),{...good,createdBy:OWNER}));
 await assertFails(updateDoc(doc(collectionOrders,'draft-ok'),{paymentStatus:'paid',updatedAt:serverTimestamp()}));
});
test('no autenticado o suspendido no crea borradores y no hay operaciones de caja',async()=>{
 const pathOrder=(db,id)=>doc(db,'businesses',BUSINESS,'draftOrders',id);
 const mock={businessId:BUSINESS,schemaVersion:1,customer:'Ejemplo',deliveryDate:'2026-11-23',
  deliveryWindow:'',items:[{name:'Brownie',qty:1}],notes:'',status:'open',paymentStatus:'pending',
  createdBy:STAFF,updatedBy:STAFF,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
 await assertFails(setDoc(pathOrder(env.unauthenticatedContext().firestore(),'guest'),mock));
 await env.withSecurityRulesDisabled(async ctx=>{
  await updateDoc(memberDoc(ctx.firestore(),STAFF),{active:false});
 });
 await assertFails(setDoc(pathOrder(env.authenticatedContext(STAFF).firestore(),'suspended'),mock));
 const db=env.authenticatedContext(OWNER).firestore();
 await assertFails(setDoc(doc(db,'businesses',BUSINESS,'cashEntries','x'),{amount:1000}));
});

test('productos: miembros activos leen y solo principal puede crear y editar',async()=>{
 const baseDb=env.authenticatedContext(OWNER).firestore();
 const productRef=doc(baseDb,'businesses',BUSINESS,'products','p-1');
 const record={businessId:BUSINESS,schemaVersion:1,name:'Churros',category:'Repostería',price:4000,
   photoUrl:'',active:true,createdAt:serverTimestamp(),createdBy:OWNER,
   updatedAt:serverTimestamp(),updatedBy:OWNER};
 await assertSucceeds(setDoc(productRef,record));
 await assertSucceeds(getDoc(doc(env.authenticatedContext(STAFF).firestore(),'businesses',BUSINESS,'products','p-1')));
 await assertSucceeds(updateDoc(productRef,{price:4500,updatedAt:serverTimestamp(),updatedBy:OWNER}));
 const dbStaff=env.authenticatedContext(STAFF).firestore();
 await assertFails(updateDoc(doc(dbStaff,'businesses',BUSINESS,'products','p-1'),{price:1,updatedAt:serverTimestamp(),updatedBy:STAFF}));
 await assertFails(setDoc(doc(dbStaff,'businesses',BUSINESS,'products','p-2'),{...record,createdBy:STAFF,updatedBy:STAFF}));
 await assertFails(updateDoc(productRef,{createdBy:STAFF,updatedAt:serverTimestamp(),updatedBy:OWNER}));
 await assertFails(updateDoc(productRef,{price:-20,updatedAt:serverTimestamp(),updatedBy:OWNER}));
 await assertFails(deleteDoc(productRef));
});
test('clientes: personal puede crear y editar campos permitidos, no alterar autoría',async()=>{
 const db=env.authenticatedContext(STAFF).firestore();
 const clientRef=doc(db,'businesses',BUSINESS,'clients','c-1');
 const payload={businessId:BUSINESS,schemaVersion:1,name:'Cliente de prueba',phone:'',notes:'',
   createdAt:serverTimestamp(),createdBy:STAFF,updatedAt:serverTimestamp(),updatedBy:STAFF};
 await assertSucceeds(setDoc(clientRef,payload));
 await assertSucceeds(updateDoc(clientRef,{phone:'912345678',updatedAt:serverTimestamp(),updatedBy:STAFF}));
 await assertFails(updateDoc(clientRef,{createdBy:OWNER,updatedAt:serverTimestamp(),updatedBy:STAFF}));
 await assertFails(updateDoc(clientRef,{businessId:'otra',updatedAt:serverTimestamp(),updatedBy:STAFF}));
 await assertFails(deleteDoc(clientRef));
 const strangerDb=env.authenticatedContext(STRANGER).firestore();
 await assertFails(getDoc(doc(strangerDb,'businesses',BUSINESS,'clients','c-1')));
});
test('suspendidos no consultan clientes ni productos, y consulta es solo lectura',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{
  await updateDoc(memberDoc(ctx.firestore(),STAFF),{active:false});
  await setDoc(memberDoc(ctx.firestore(),'readonly-fixture'),basic('readonly-fixture','consulta'));
 });
 const suspended=env.authenticatedContext(STAFF).firestore();
 await assertFails(getDocs(collection(suspended,'businesses',BUSINESS,'products')));
 await assertFails(getDocs(collection(suspended,'businesses',BUSINESS,'clients')));
 const observer=env.authenticatedContext('readonly-fixture').firestore();
 await assertSucceeds(getDocs(collection(observer,'businesses',BUSINESS,'products')));
 await assertFails(setDoc(doc(observer,'businesses',BUSINESS,'clients','readonly-created'),{
  businessId:BUSINESS,schemaVersion:1,name:'No autorizado',phone:'',notes:'',
  createdAt:serverTimestamp(),createdBy:'readonly-fixture',updatedAt:serverTimestamp(),updatedBy:'readonly-fixture'
 }));
});

test('ventas definitivas, pagos, stock y auditoría solo admiten escritura del servidor',async()=>{
 const db=env.authenticatedContext(OWNER).firestore();
 await assertFails(setDoc(doc(db,'businesses',BUSINESS,'orders','order-denied'),{name:'Pedido'}));
 await assertFails(setDoc(doc(db,'businesses',BUSINESS,'inventory','stock-denied'),{quantity:10}));
 await assertFails(setDoc(doc(db,'businesses',BUSINESS,'cashEntries','cash-denied'),{amount:5000}));
 await assertFails(setDoc(doc(db,'businesses',BUSINESS,'audit','audit-denied'),{action:'edit'}));
});
