// Ejecutar exclusivamente contra los emuladores locales de Firebase.
// npm run test:rules (instala Java para Firestore Emulator y Node 20+).
import {readFileSync} from 'node:fs';
import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,serverTimestamp,deleteDoc,query,where,orderBy,limit,startAfter} from 'firebase/firestore';

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

test('miembros pueden consultar borradores; caja solo principal',async()=>{
 for(const uid of [OWNER,STAFF]){
  const db=env.authenticatedContext(uid).firestore();
  await assertSucceeds(getDoc(doc(db,'businesses',BUSINESS,'draftOrders','test-order')));
  if(uid===OWNER)await assertSucceeds(getDoc(doc(db,'businesses',BUSINESS,'cashEntries','test-cash')));
  else await assertFails(getDoc(doc(db,'businesses',BUSINESS,'cashEntries','test-cash')));
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
   photoUrl:'',stockMode:'permanent',active:true,createdAt:serverTimestamp(),createdBy:OWNER,
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

test('contadores y operaciones solo son legibles por principal; nadie escribe desde el navegador',async()=>{
 const ownerDb=env.authenticatedContext(OWNER).firestore();
 const staffDb=env.authenticatedContext(STAFF).firestore();
 for(const group of ['counters','operations']){
  const ownerRef=doc(ownerDb,'businesses',BUSINESS,group,'demo');
  const staffRef=doc(staffDb,'businesses',BUSINESS,group,'demo');
  await assertSucceeds(getDoc(ownerRef));
  await assertFails(getDoc(staffRef));
  await assertFails(setDoc(ownerRef,{value:123}));
  await assertFails(setDoc(staffRef,{value:123}));
 }
});

test('el historial compartido admite consultas por fecha de entrega con paginación',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  for(let i=1;i<=5;i++)await setDoc(doc(db,'businesses',BUSINESS,'orders','report-'+i),{
   customer:'Cliente '+i,deliveryDate:i<=4?'2026-11-24':'2026-11-25',total:1000*i
  });
 });
 const db=env.authenticatedContext(STAFF).firestore();
 const orders=collection(db,'businesses',BUSINESS,'orders');
 const first=await assertSucceeds(getDocs(query(orders,where('deliveryDate','>=','2026-11-24'),
  where('deliveryDate','<=','2026-11-24'),orderBy('deliveryDate'),limit(2))));
 assert.equal(first.docs.length,2);
 const second=await assertSucceeds(getDocs(query(orders,where('deliveryDate','>=','2026-11-24'),
  where('deliveryDate','<=','2026-11-24'),orderBy('deliveryDate'),startAfter(first.docs[1]),limit(2))));
 assert.equal(second.docs.length,2);
 assert.equal(new Set([...first.docs,...second.docs].map(d=>d.id)).size,4);
 const third=await assertSucceeds(getDocs(query(orders,where('deliveryDate','>=','2026-11-24'),
  where('deliveryDate','<=','2026-11-24'),orderBy('deliveryDate'),startAfter(second.docs[1]),limit(2))));
 assert.equal(third.docs.length,0);
});
test('movimientos de caja por período solo pueden consultarse desde cuenta principal',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{
  await setDoc(doc(ctx.firestore(),'businesses',BUSINESS,'cashEntries','cash-period-1'),{
   day:'2026-11-24',method:'efectivo',direction:'in',amount:1000
  });
 });
 const root='businesses/'+BUSINESS+'/cashEntries';
 const ownerDb=env.authenticatedContext(OWNER).firestore();
 const staffDb=env.authenticatedContext(STAFF).firestore();
 const requestPage=db=>getDocs(query(collection(db,root),where('day','>=','2026-11-24'),
  where('day','<=','2026-11-24'),orderBy('day'),limit(200)));
 const owner=await assertSucceeds(requestPage(ownerDb));
 assert.equal(owner.size,1);
 await assertFails(requestPage(staffDb));
});

test('denegación individual bloquea lectura de comandas y creación de clientes',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  await updateDoc(memberDoc(db,STAFF),{denies:['orders.read','clients.manage']});
  await setDoc(doc(db,'businesses',BUSINESS,'orders','order-permission-denied'),{customer:'Ejemplo'});
 });
 const db=env.authenticatedContext(STAFF).firestore();
 await assertFails(getDoc(doc(db,'businesses',BUSINESS,'orders','order-permission-denied')));
 await assertFails(getDocs(collection(db,'businesses',BUSINESS,'orders')));
 await assertFails(setDoc(doc(db,'businesses',BUSINESS,'clients','client-permission-denied'),{
  businessId:BUSINESS,schemaVersion:1,name:'Cliente bloqueado',phone:'',notes:'',
  createdAt:serverTimestamp(),createdBy:STAFF,updatedAt:serverTimestamp(),updatedBy:STAFF
 }));
});
test('permiso explícito habilita editar catálogo al personal, y revocarlo lo bloquea',async()=>{
 const dbAdmin=env.authenticatedContext(OWNER).firestore();
 const dbStaff=env.authenticatedContext(STAFF).firestore();
 const product=doc(dbAdmin,'businesses',BUSINESS,'products','product-permissions');
 await assertSucceeds(setDoc(product,{
  businessId:BUSINESS,schemaVersion:1,name:'Producto real',category:'Repostería',
  price:4000,active:true,stockMode:'permanent',photoUrl:'',
  createdAt:serverTimestamp(),createdBy:OWNER,updatedAt:serverTimestamp(),updatedBy:OWNER
 }));
 const userProduct=doc(dbStaff,'businesses',BUSINESS,'products','product-permissions');
 await assertFails(updateDoc(userProduct,{price:4200,updatedAt:serverTimestamp(),updatedBy:STAFF}));
 await env.withSecurityRulesDisabled(async ctx=>{
  await updateDoc(memberDoc(ctx.firestore(),STAFF),{grants:['products.manage']});
 });
 await assertSucceeds(updateDoc(userProduct,{price:4300,updatedAt:serverTimestamp(),updatedBy:STAFF}));
 await env.withSecurityRulesDisabled(async ctx=>{
  await updateDoc(memberDoc(ctx.firestore(),STAFF),{denies:['products.manage']});
 });
 await assertFails(updateDoc(userProduct,{price:4400,updatedAt:serverTimestamp(),updatedBy:STAFF}));
});
