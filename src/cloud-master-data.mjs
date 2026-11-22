// Gula Comandas 2.0: acceso compartido a Productos y Clientes.
// Etapa preparatoria: no convierte la app local en un sistema de ventas real.
import {getFirestore,collection,doc,getDoc,runTransaction,updateDoc,getDocs,onSnapshot,
  query,orderBy,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

function textValue(value,max,label,{required=false}={}){
  const valueString=String(value??'').trim();
  if(valueString.length>max || (required && valueString.length<2))
    throw Error(label+' no válido');
  return valueString;
}
function validateProduct(data){
 const name=textValue(data.name,100,'Nombre del producto',{required:true});
 const category=textValue(data.category,80,'Categoría');
 const photoUrl=textValue(data.photoUrl,500,'URL de fotografía');
 if(photoUrl && !/^https:\/\//.test(photoUrl))throw Error('Usa una URL HTTPS para fotografías compartidas');
 const price=Number(data.price);
 if(!Number.isSafeInteger(price)||price<0||price>10000000)throw Error('Precio no válido');
 const stockMode=data.stockMode==='dated'?'dated':'permanent';
 const options=Array.isArray(data.options)?data.options:[];
 if(options.length>20)throw Error('Máximo 20 opciones');
 const seen=new Set();
 const cleanOptions=options.map(o=>{
  const optionName=textValue(o.name,80,'Nombre de la opción',{required:true});
  const extra=Number(o.extra);
  if(!Number.isSafeInteger(extra)||extra<0||extra>1000000)
   throw Error('Recargo de opción inválido');
  const key=optionName.toLowerCase();
  if(seen.has(key))throw Error('Opciones duplicadas');
  seen.add(key);
  return {name:optionName,extra};
 });
 return {name,category,price,photoUrl,stockMode,options:cleanOptions,active:data.active===true};
}
function validateClient(data){
 const name=textValue(data.name,100,'Nombre del cliente',{required:true});
 const phone=textValue(data.phone,30,'Teléfono');
 const notes=textValue(data.notes,500,'Observaciones');
 return {name,phone,notes};
}
export function sharedMasterData(firebaseApp,businessId='gula'){
 if(businessId!=='gula')throw Error('Identificador de negocio no autorizado');
 const db=getFirestore(firebaseApp);
 const products=collection(db,'businesses',businessId,'products');
 const clients=collection(db,'businesses',businessId,'clients');
 const actorUid=(actor)=>{
  if(!actor?.uid)throw Error('Inicia sesión para continuar');
  return actor.uid;
 };
 const readSnapshot=snapshot=>snapshot.docs.map(d=>({id:d.id,...d.data()}));
 const createOnce=async (collectionRef,uid,payload,idempotencyKey)=>{
  const id=String(idempotencyKey||'');
  if(!/^[A-Za-z0-9_-]{12,80}$/.test(id))throw Error('Falta clave única de creación');
  const ref=doc(collectionRef,id);
  try{
   return await runTransaction(db,async tx=>{
    const current=await tx.get(ref);
    if(current.exists()){
     const record=current.data();
     const same=Object.entries(payload).every(([k,v])=>JSON.stringify(record[k])===JSON.stringify(v));
     if(record.createdBy!==uid||!same)throw Error('La clave de creación ya pertenece a otro registro');
     return id;
    }
    tx.set(ref,{businessId,schemaVersion:1,...payload,
     createdAt:serverTimestamp(),createdBy:uid,updatedAt:serverTimestamp(),updatedBy:uid});
    return id;
   });
  }catch(error){
   // Una respuesta ambigua no autoriza repetir una creación con otro ID.
   // Consultar la misma referencia y confirmar contenido si el servidor llegó a guardar.
   try{
    const committed=await getDoc(ref);
    const same=committed.exists()&&committed.data().createdBy===uid&&
     Object.entries(payload).every(([k,v])=>JSON.stringify(committed.data()[k])===JSON.stringify(v));
    if(same)return id;
   }catch{}
   throw error;
  }
 };

 return {
  async listProducts(){
   return readSnapshot(await getDocs(query(products,orderBy('name'))));
  },
  watchProducts(onData,onError){
   return onSnapshot(query(products,orderBy('name')),snap=>onData(readSnapshot(snap)),onError);
  },
  async addProduct(actor,data,idempotencyKey){
   const uid=actorUid(actor);
   return createOnce(products,uid,validateProduct(data),idempotencyKey);
  },
  async editProduct(actor,id,data){
   const uid=actorUid(actor);
   if(!id)throw Error('Identificador de producto requerido');
   await updateDoc(doc(products,id),{...validateProduct(data),updatedAt:serverTimestamp(),updatedBy:uid});
  },
  async listClients(){
   return readSnapshot(await getDocs(query(clients,orderBy('name'))));
  },
  watchClients(onData,onError){
   return onSnapshot(query(clients,orderBy('name')),snap=>onData(readSnapshot(snap)),onError);
  },
  async addClient(actor,data,idempotencyKey){
   const uid=actorUid(actor);
   return createOnce(clients,uid,validateClient(data),idempotencyKey);
  },
  async editClient(actor,id,data){
   const uid=actorUid(actor);
   if(!id)throw Error('Identificador de cliente requerido');
   await updateDoc(doc(clients,id),{...validateClient(data),updatedAt:serverTimestamp(),updatedBy:uid});
  }
 };
}
