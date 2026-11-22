// Gula Comandas 2.0 - Functions PREPARADAS, NO DESPLEGADAS.
// Necesitan plan Blaze, validación de integración y aprobación antes de vender.
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {initializeApp,getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createSalesCore} from './core.mjs';
if(!getApps().length)initializeApp();
const sales=createSalesCore(getFirestore());
const wrap=(method)=>onCall({region:'southamerica-west1',maxInstances:5},async req=>{
 if(!req.auth?.uid)throw new HttpsError('unauthenticated','Inicia sesión para continuar');
 try{return await method(req.auth.uid,req.data)}
 catch(e){
  const message=String(e?.message||'No se pudo completar la operación').slice(0,220);
  if(/acceso|permiso|perfil/i.test(message))throw new HttpsError('permission-denied',message);
  if(/inválid|incorrect|requiere|agotad|insuficiente|saldo|stock|comanda|producto|monto|pedido|ya no|no hay/i.test(message))
   throw new HttpsError('failed-precondition',message);
  console.error('Operación fallida',message);
  throw new HttpsError('internal','No se pudo completar la operación');
 }
});
export const createSaleOrder=wrap(sales.createSaleOrder);
export const recordSalePayment=wrap(sales.recordSalePayment);
export const adjustSaleInventory=wrap(sales.adjustSaleInventory);
export const cancelSaleOrder=wrap(sales.cancelSaleOrder);
export const recordSaleRefund=wrap(sales.recordSaleRefund);
export const recordCashMovement=wrap(sales.recordCashMovement);
export const previewCashDay=wrap(sales.previewCashDay);
export const closeCashDay=wrap(sales.closeCashDay);
