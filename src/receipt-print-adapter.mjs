// Adaptador de lectura: imprime una comanda local sin modificarla ni enviarla a Firebase.
// La web actual de Gula guarda las comandas demo con qty/product/delivery.
function validMoney(v,label){
 const n=Number(v);
 if(!Number.isSafeInteger(n)||n<0||n>100000000)throw Error(label+' inválido para impresión');
 return n;
}
export function demoOrderForReceipt(o){
 if(!o||typeof o!=='object'||!Array.isArray(o.items)||!o.items.length)
  throw Error('Selecciona una comanda con productos');
 const items=o.items.map(i=>{
  const quantity=Number(i.qty),name=String(i.product||'').trim(),price=validMoney(i.price,'Precio');
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>999||!name)
   throw Error('La comanda tiene una línea de producto inválida');
  return {name,quantity,price,option:String(i.option||'')};
 });
 const total=validMoney(o.total,'Total');
 const paid=Array.isArray(o.payments)
  ?o.payments.reduce((sum,p)=>sum+validMoney(p.amount,'Abono'),0)
  :o.paystatus==='Pagado'?total:0;
 if(paid>total)throw Error('Los abonos superan el total de la comanda');
 const canceled=o.canceled===true;
 return {
  number:String(o.number||'SIN NÚMERO'),
  customer:String(o.customer||'No indicado'),
  deliveryDate:String(o.delivery||''),
  deliveryWindow:String(o.deliveryTime||''),
  notes:String(o.observations||''),
  items,total,paidTotal:paid,balance:canceled?0:total-paid,
  paymentStatus:paid===0?'pending':paid>=total?'paid':'partial',
  canceled,printTest:String(o.number||'').startsWith('DEMO-')
 };
}
