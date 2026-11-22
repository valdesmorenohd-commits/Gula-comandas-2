// Puente de la interfaz Gula hacia operaciones transaccionales de servidor.
// NO conectar al sitio hasta desplegar reglas/Functions y aprobar pruebas reales.
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import {getFirestore,collection,query,orderBy,limit,onSnapshot} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export function sharedSales(firebaseApp,businessId='gula'){
 if(businessId!=='gula')throw Error('Negocio inválido');
 const fn=getFunctions(firebaseApp,'southamerica-west1');
 const db=getFirestore(firebaseApp);
 const orders=collection(db,'businesses',businessId,'orders');
 const inventory=collection(db,'businesses',businessId,'inventory');
 const cash=collection(db,'businesses',businessId,'cashEntries');
 const createOrder=httpsCallable(fn,'createSaleOrder');
 const recordPayment=httpsCallable(fn,'recordSalePayment');
 const adjustInventory=httpsCallable(fn,'adjustSaleInventory');
 const cancelOrder=httpsCallable(fn,'cancelSaleOrder');
 const recordRefund=httpsCallable(fn,'recordSaleRefund');
 const cashMovement=httpsCallable(fn,'recordCashMovement');
 const previewCash=httpsCallable(fn,'previewCashDay');
 const closeCash=httpsCallable(fn,'closeCashDay');
 // La app debe conservar la clave de cada solicitud hasta obtener confirmación.
 // No crear una clave nueva al reintentar un pago o guardado incierto.
 const key=()=>crypto.randomUUID();
 return {
  newIdempotencyKey:key,
  async createOrder(data,idempotencyKey){
   if(!idempotencyKey)throw Error('Necesitas conservar la clave de la operación');
   const result=await createOrder({...data,idempotencyKey});
   return result.data;
  },
  async recordPayment(orderId,amount,method,idempotencyKey){
   if(!idempotencyKey)throw Error('Necesitas conservar la clave del pago');
   const result=await recordPayment({orderId,amount,method,idempotencyKey});
   return result.data;
  },
  async adjustInventory(productId,date,delta,reason,idempotencyKey){
   if(!idempotencyKey)throw Error('Necesitas conservar la clave del ajuste');
   const result=await adjustInventory({productId,date,delta,reason,idempotencyKey});
   return result.data;
  },
  async cancelOrder(orderId,reason,idempotencyKey){
   if(!idempotencyKey)throw Error('Conserva la clave de anulación hasta recibir respuesta');
   return (await cancelOrder({orderId,reason,idempotencyKey})).data;
  },
  async recordRefund(orderId,amount,method,idempotencyKey){
   if(!idempotencyKey)throw Error('Conserva la clave de devolución hasta recibir respuesta');
   return (await recordRefund({orderId,amount,method,idempotencyKey})).data;
  },
  async recordCashMovement(data,idempotencyKey){
   if(!idempotencyKey)throw Error('Conserva la clave del movimiento hasta recibir respuesta');
   return (await cashMovement({...data,idempotencyKey})).data;
  },
  async previewCashDay(day,openingCash=0){
   return (await previewCash({day,openingCash})).data;
  },
  async closeCashDay(data,idempotencyKey){
   if(!idempotencyKey)throw Error('Conserva la clave del cierre');
   return (await closeCash({...data,idempotencyKey})).data;
  },
  watchOrders(handler,onError){
   return onSnapshot(query(orders,orderBy('createdAt','desc'),limit(200)),
    snapshot=>handler(snapshot.docs.map(d=>({id:d.id,...d.data()}))),onError);
  },
  watchInventory(handler,onError){
   return onSnapshot(inventory,
    snapshot=>handler(snapshot.docs.map(d=>({id:d.id,...d.data()}))),onError);
  },
  watchCash(handler,onError){
   return onSnapshot(query(cash,orderBy('createdAt','desc'),limit(200)),
    snapshot=>handler(snapshot.docs.map(d=>({id:d.id,...d.data()}))),onError);
  }
 };
}
