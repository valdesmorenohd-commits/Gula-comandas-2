// Gula Comandas 2.0: base de persistencia compartida para BORRADORES de pedidos.
// Aún NO admite pagos, descuentos, cambios de stock, ediciones o cierres.
// La interfaz comercial NO debe usarlo como registro definitivo de venta.
import {getFirestore,collection,doc,addDoc,getDocs,query,orderBy,serverTimestamp,onSnapshot,limit} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
export function cloudOrderDrafts(firebaseApp,businessId='gula'){
  if(businessId!=='gula')throw Error('Negocio no autorizado');
  const db=getFirestore(firebaseApp);
  const orders=collection(db,'businesses',businessId,'orders');
  function normalized(draft){
    const customer=String(draft?.customer||'').trim(),deliveryDate=String(draft?.deliveryDate||''),deliveryWindow=String(draft?.deliveryWindow||'').slice(0,100),
    notes=String(draft?.notes||'').slice(0,1500);
    if(!customer||customer.length>100)throw Error('Nombre de cliente requerido (máximo 100 caracteres)');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate))throw Error('Fecha de entrega no válida');
    const items=Array.isArray(draft?.items)?draft.items:[];
    if(!items.length||items.length>30)throw Error('La comanda requiere entre 1 y 30 líneas');
    // Campos declarativos solamente. No se aceptan importes ni estado pagado.
    const lines=items.map(i=>{
      const name=String(i?.name||'').trim();
      const qty=Number(i?.qty);
      if(!name||name.length>100||!Number.isInteger(qty)||qty<1||qty>99)throw Error('Producto o cantidad inválida');
      return {name,qty};
    });
    return {customer,deliveryDate,deliveryWindow,notes,items:lines};
  }
  return {
    async createDraft(authUser,draft){
      if(!authUser?.uid)throw Error('Inicio de sesión requerido');
      const record={businessId,schemaVersion:1,...normalized(draft),status:'open',paymentStatus:'pending',
        createdBy:authUser.uid,updatedBy:authUser.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
      const result=await addDoc(orders,record);
      return result.id;
    },
    async listRecent(){
      const snap=await getDocs(query(orders,orderBy('createdAt','desc'),limit(100)));
      return snap.docs.map(d=>({id:d.id,...d.data()}));
    },
    watchRecent(callback,errorCallback){
      return onSnapshot(query(orders,orderBy('createdAt','desc'),limit(100)),snap=>{
        callback(snap.docs.map(d=>({id:d.id,...d.data()})));
      },errorCallback);
    }
  };
}
