// Validaciones puras del backend de ventas de Gula.
export function orderInput(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Solicitud inválida');
 const customer=String(raw.customer||'').trim();
 if(customer.length<2||customer.length>100)throw Error('Nombre de cliente inválido');
 const deliveryDate=String(raw.deliveryDate||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) || Number.isNaN(Date.parse(deliveryDate+'T12:00:00Z')))
  throw Error('Fecha de entrega inválida');
 const deliveryWindow=String(raw.deliveryWindow||'').trim();
 if(deliveryWindow.length>100)throw Error('Horario demasiado largo');
 const notes=String(raw.notes||'').trim();
 if(notes.length>1500)throw Error('Observaciones demasiado largas');
 if(!Array.isArray(raw.items)||raw.items.length<1||raw.items.length>20)
  throw Error('Se admiten entre 1 y 20 productos');
 const qtys=new Map();
 for(const line of raw.items){
  const id=String(line?.productId||'');
  const quantity=Number(line?.quantity);
  if(!/^[A-Za-z0-9_-]{5,128}$/.test(id))throw Error('Producto inválido');
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>99)throw Error('Cantidad inválida');
  qtys.set(id,(qtys.get(id)||0)+quantity);
  if(qtys.get(id)>99)throw Error('Cantidad máxima por producto: 99');
 }
 return {customer,deliveryDate,deliveryWindow,notes,
  items:[...qtys].map(([productId,quantity])=>({productId,quantity}))};
}
export function paymentInput(raw){
 const amount=Number(raw?.amount),method=String(raw?.method||'').toLowerCase();
 if(!Number.isSafeInteger(amount)||amount<=0||amount>10000000)throw Error('Monto inválido');
 if(!['efectivo','tef'].includes(method))throw Error('Medio de pago inválido');
 return {amount,method};
}
export function adjustmentInput(raw){
 const productId=String(raw?.productId||''),date=String(raw?.date||'');
 const delta=Number(raw?.delta),reason=String(raw?.reason||'').trim();
 if(!/^[A-Za-z0-9_-]{5,128}$/.test(productId))throw Error('Producto inválido');
 if(date && (!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z'))))throw Error('Fecha inválida');
 if(!Number.isSafeInteger(delta)||delta===0||Math.abs(delta)>100000)throw Error('Ajuste inválido');
 if(reason.length<4||reason.length>200)throw Error('Motivo obligatorio de 4 a 200 caracteres');
 return {productId,date,delta,reason};
}
export function idempotencyKey(value){
 const key=String(value||'');
 if(!/^[A-Za-z0-9_-]{12,80}$/.test(key))throw Error('Identificador único de solicitud inválido');
 return key;
}
export function inventoryKey(productId,deliveryDate,stockMode){
 return productId+'__'+(stockMode==='dated'?deliveryDate:'permanent');
}
export function computeTotal(lines){
 const sum=lines.reduce((n,x)=>n+x.quantity*x.price,0);
 if(!Number.isSafeInteger(sum)||sum<=0||sum>100000000)throw Error('Total inválido');
 return sum;
}
