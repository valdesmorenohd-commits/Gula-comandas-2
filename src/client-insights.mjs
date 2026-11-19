// Análisis local de clientes y cumpleaños. No envía comunicaciones.
// Las comandas se vinculan EXCLUSIVAMENTE mediante clientId.
export function clientPurchaseReport(orders=[],clientId){
 const matched=orders.filter(o=>o?.clientId===clientId&&!o.canceled);
 const grouped=new Map();
 let units=0,total=0;
 for(const o of matched){
  total+=Number(o.total)||0;
  for(const item of o.items||[]){
   const qty=Number(item.qty)||0;
   if(qty<=0)continue;
   const name=String(item.product||'Producto').trim();
   const option=String(item.option||'').trim();
   const key=String(item.productId||name)+'|'+option;
   const old=grouped.get(key)||{name,option,units:0,orders:0,amount:0};
   old.units+=qty;old.orders++;old.amount+=qty*(Number(item.price)||0);units+=qty;
   grouped.set(key,old);
  }
 }
 const timestamps=matched.map(o=>Date.parse(o.createdAt||'')).filter(Number.isFinite).sort((a,b)=>a-b);
 const first=timestamps.length?new Date(timestamps[0]).toISOString():'';
 const last=timestamps.length?new Date(timestamps.at(-1)).toISOString():'';
 const avgDaysBetween=timestamps.length>1?Math.round((timestamps.at(-1)-timestamps[0])/86400000/(timestamps.length-1)):null;
 return {orders:matched.length,total,units,average:matched.length?Math.round(total/matched.length):0,first,last,avgDaysBetween,products:[...grouped.values()].sort((a,b)=>b.units-a.units||b.amount-a.amount||a.name.localeCompare(b.name,'es'))};
}
export function validBirthday(value){
 if(!value)return '';
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
 if(!m)return '';
 const [year,month,day]=m.slice(1).map(Number);
 const date=new Date(Date.UTC(year,month-1,day));
 return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day&&year>=1900&&year<=2100?value:'';
}
export function birthdayInDays(birthDate,todayISO){
 if(!validBirthday(birthDate)||!/^\d{4}-\d{2}-\d{2}$/.test(todayISO||''))return null;
 const today=new Date(todayISO+'T12:00:00Z');
 if(Number.isNaN(today.getTime()))return null;
 const [,year,month,day]=birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/).map(Number);
 for(let candidate=today.getUTCFullYear();candidate<=today.getUTCFullYear()+4;candidate++){
  // El 29 de febrero se recuerda el 28 en años no bisiestos.
  const febLeap=month===2&&day===29&&new Date(Date.UTC(candidate,1,29)).getUTCMonth()!==1;
  const when=new Date(Date.UTC(candidate,month-1,febLeap?28:day,12));
  const difference=Math.round((when.getTime()-today.getTime())/86400000);
  if(difference>=0)return difference;
 }
 return null;
}
export function birthdayAlerts(clients,todayISO,daysAhead=14){
 return clients.map(c=>({...c,daysToBirthday:birthdayInDays(c.birthday,todayISO)}))
  .filter(c=>c.daysToBirthday!==null&&c.daysToBirthday<=daysAhead)
  .sort((a,b)=>a.daysToBirthday-b.daysToBirthday||a.name.localeCompare(b.name,'es'));
}
export function eligibleBirthdayEmail(client,todayISO){
 return client?.birthdayEmailConsent===true
  && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email||'')
  && birthdayInDays(client.birthday,todayISO)===0;
}
