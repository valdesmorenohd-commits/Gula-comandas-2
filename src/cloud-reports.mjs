// Gula Comandas 2.0: cálculo puro para informes de datos compartidos.
// No mezcla ventas por fecha de pedido/entrega con dinero cobrado en otra fecha.
export function dayOf(value){
 if(typeof value==='string'){
  const found=value.match(/^\d{4}-\d{2}-\d{2}/);
  return found?found[0]:'';
 }
 if(value&&typeof value.toDate==='function')return dayOf(value.toDate());
 if(value instanceof Date){
  if(Number.isNaN(value.getTime()))return '';
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',
   year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
 }
 if(value&&Number.isFinite(value.seconds))return dayOf(new Date(value.seconds*1000));
 return '';
}
function amount(value,label){
 const n=Number(value);
 if(!Number.isSafeInteger(n)||n<0||n>1000000000)
  throw Error('Importe inválido en '+label);
 return n;
}
function rangeMatch(day,from,to){return !!day&&(!from||day>=from)&&(!to||day<=to)}
function checkDate(day){
 if(!day)return '';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Fecha no válida');
 const date=new Date(day+'T12:00:00Z');
 if(Number.isNaN(date.valueOf())||date.toISOString().slice(0,10)!==day)
  throw Error('Fecha inexistente');
 return day;
}
export function buildSharedReport({orders=[],cashEntries=[],from='',to='',dateType='delivery',
 customer='',status='all',productId='',orderLimit=200,cashLimit=200}={}){
 from=checkDate(from);to=checkDate(to);
 if(from&&to&&from>to)throw Error('La fecha inicial es posterior a la final');
 if(!['delivery','created'].includes(dateType))throw Error('Tipo de fecha inválido');
 if(!['all','open','closed','canceled','pending','partial','paid'].includes(status))
  throw Error('Estado inválido');
 if(!Array.isArray(orders)||!Array.isArray(cashEntries))throw Error('No hay datos de informes válidos');
 const search=String(customer).trim().toLocaleLowerCase('es-CL');
 const chosenOrders=orders.filter(o=>{
  const d=dateType==='created'?dayOf(o.createdAt):dayOf(o.deliveryDate);
  if(!rangeMatch(d,from,to))return false;
  if(search&&!String(o.customer||'').toLocaleLowerCase('es-CL').includes(search))return false;
  if(status!=='all'&&o.status!==status&&o.paymentStatus!==status)return false;
  if(productId&&!(o.items||[]).some(i=>i.productId===productId))return false;
  return true;
 });
 let sales=0,receivable=0,refundPending=0,canceled=0,units=0;
 const products=new Map(),daily=new Map();
 for(const o of chosenOrders){
  const isCanceled=o.status==='canceled';
  if(isCanceled){canceled++;refundPending+=amount(o.refundDue||0,'devolución pendiente');continue}
  const total=amount(o.total,'total de comanda');
  const balance=amount(o.balance,'saldo de comanda');
  if(balance>total)throw Error('Saldo de comanda superior al total');
  sales+=total;receivable+=balance;
  const day=dayOf(dateType==='created'?o.createdAt:o.deliveryDate);
  const prior=daily.get(day)||{day,orders:0,total:0};
  prior.orders++;prior.total+=total;daily.set(day,prior);
  for(const item of o.items||[]){
   const q=amount(item.quantity,'cantidad');
   const price=amount(item.price,'precio');
   const name=String(item.name||'Producto');
   const id=String(item.productId||name);
   const p=products.get(id)||{id,name,units:0,total:0};
   p.units+=q;p.total+=q*price;units+=q;products.set(id,p);
  }
 }
 const money={cashIn:0,cashOut:0,tefIn:0,tefOut:0,payments:0,refunds:0,
  expenses:0,withdrawals:0};
 let movementCount=0;
 for(const m of cashEntries){
  if(!rangeMatch(dayOf(m.day||m.createdAt),from,to))continue;
  const amt=amount(m.amount,'movimiento de caja');
  const method=String(m.method||'').toLocaleLowerCase('es-CL');
  const direction=m.direction;
  if(!['efectivo','tef'].includes(method)||!['in','out'].includes(direction))
   throw Error('Movimiento de caja con medio o dirección inválidos');
  money[(method==='efectivo'?'cash':'tef')+(direction==='in'?'In':'Out')]+=amt;
  if(m.kind==='payment'&&direction==='in')money.payments+=amt;
  if(m.kind==='refund'&&direction==='out')money.refunds+=amt;
  if(m.kind==='manual'&&direction==='out'){
   if(String(m.category||'').toLocaleLowerCase('es-CL').includes('retiro'))money.withdrawals+=amt;
   else money.expenses+=amt;
  }
  movementCount++;
 }
 const response={
  orderCount:chosenOrders.length,activeCount:chosenOrders.length-canceled,canceled,
  sales,receivable,refundPending,units,
  cashIn:money.cashIn,cashOut:money.cashOut,tefIn:money.tefIn,tefOut:money.tefOut,
  cashNet:money.cashIn-money.cashOut,tefNet:money.tefIn-money.tefOut,
  payments:money.payments,refunds:money.refunds,
  expenses:money.expenses,withdrawals:money.withdrawals,movementCount,
  netReceipts:money.payments-money.refunds,
  products:[...products.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'es')),
  byDay:[...daily.values()].sort((a,b)=>a.day.localeCompare(b.day)),
  from,to,dateType,
  partialOrders:orders.length>=orderLimit,
  partialCash:cashEntries.length>=cashLimit
 };
 return response;
}
