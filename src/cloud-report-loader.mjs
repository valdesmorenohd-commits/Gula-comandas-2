// Consulta explícita y paginada para informes de Gula. No crea ni modifica datos.
// Evita calcular totales del período a partir del visor de las 200 ventas recientes.
import {getFirestore,collection,query,where,orderBy,limit,startAfter,getDocs} from
 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const BATCH=200;
const MAX_ROWS=5000;
function validDay(day){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))throw Error('Indica fechas desde y hasta');
 const d=new Date(day+'T12:00:00Z');
 if(Number.isNaN(d.valueOf())||d.toISOString().slice(0,10)!==day)throw Error('Fecha incorrecta');
 return day;
}
function batchLimit(pageCap){return Math.min(BATCH,pageCap)}
async function collect(db,businessId,group,field,start,end,{maxRows=MAX_ROWS}={}){
 let cursor=null,rows=[],hasMore=false;
 // Pedimos una fila adicional para detectar un período que excede el límite.
 while(rows.length<=maxRows){
  const remaining=maxRows+1-rows.length;
  const constraints=[
   where(field,'>=',start),where(field,'<=',end),orderBy(field,'asc'),limit(batchLimit(remaining))
  ];
  if(cursor)constraints.push(startAfter(cursor));
  const snapshot=await getDocs(query(collection(db,'businesses',businessId,group),...constraints));
  if(snapshot.empty)break;
  rows.push(...snapshot.docs.map(d=>({id:d.id,...d.data()})));
  cursor=snapshot.docs.at(-1);
  if(snapshot.size<batchLimit(remaining))break;
 }
 if(rows.length>maxRows){hasMore=true;rows=rows.slice(0,maxRows)}
 return {rows,hasMore};
}
export async function loadSharedReportPeriod(firebaseApp,{from,to,dateType='delivery',
 principal=false,businessId='gula',maxRows=MAX_ROWS}={}){
 from=validDay(from);to=validDay(to);
 if(from>to)throw Error('La fecha inicial supera la final');
 if(businessId!=='gula'||!['created','delivery'].includes(dateType))throw Error('Parámetros de informe inválidos');
 if(!Number.isInteger(maxRows)||maxRows<1||maxRows>MAX_ROWS)throw Error('Límite de consulta inválido');
 const db=getFirestore(firebaseApp);
 // No usar fechas ISO crudas para createdAt; createdAt es Timestamp.
 // Se consulta un margen UTC de un día a cada lado y luego se filtra en hora de Chile.
 const orders=dateType==='created'
  ?await collect(db,businessId,'orders','createdAt',
     new Date(new Date(from+'T00:00:00Z').getTime()-86400000),
     new Date(new Date(to+'T23:59:59.999Z').getTime()+86400000),{maxRows})
  :await collect(db,businessId,'orders','deliveryDate',from,to,{maxRows});
 const cash=principal
  ?await collect(db,businessId,'cashEntries','day',from,to,{maxRows})
  :{rows:[],hasMore:false};
 return {orders:orders.rows,cashEntries:cash.rows,partialOrders:orders.hasMore,
  partialCash:cash.hasMore,from,to,dateType,
  message:orders.hasMore||cash.hasMore?'Se superó el límite de seguridad: amplía precisión reduciendo las fechas.':
   'Período consultado con paginación de Firestore.'};
}
