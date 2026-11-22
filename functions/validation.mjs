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
  const option=String(line?.option||'').trim();
  if(option.length>80)throw Error('Opción de producto demasiado larga');
  if(!/^[A-Za-z0-9_-]{5,128}$/.test(id))throw Error('Producto inválido');
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>99)throw Error('Cantidad inválida');
  const key=id+'\u0000'+option;
  qtys.set(key,(qtys.get(key)||0)+quantity);
  if(qtys.get(key)>99)throw Error('Cantidad máxima por opción: 99');
 }
 return {customer,deliveryDate,deliveryWindow,notes,
  items:[...qtys].map(([key,quantity])=>{
    const [productId,option]=key.split('\u0000');return {productId,option,quantity};
  })};
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

export function cancellationInput(raw){
 const reason=String(raw?.reason||'').trim();
 if(reason.length<5||reason.length>300)throw Error('Indica un motivo de anulación de entre 5 y 300 caracteres');
 return {reason};
}
export function refundInput(raw){
 return paymentInput(raw);
}
export function cashMovementInput(raw){
 const direction=String(raw?.direction||'');
 const category=String(raw?.category||'').trim();
 const note=String(raw?.note||'').trim();
 const {amount,method}=paymentInput(raw);
 if(!['in','out'].includes(direction))throw Error('Movimiento de caja inválido');
 if(category.length<3||category.length>80)throw Error('Categoría de caja inválida');
 if(note.length>300)throw Error('Observación de caja demasiado larga');
 return {direction,category,note,amount,method};
}
export function validateBusinessDate(value){
 const day=String(value||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Fecha de caja inválida');
 const d=new Date(day+'T12:00:00Z');
 if(Number.isNaN(d.valueOf())||d.toISOString().slice(0,10)!==day)throw Error('Fecha de caja inválida');
 return day;
}
export function localChileDay(date=new Date()){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}

export function closingInput(raw){
 const day=validateBusinessDate(raw?.day);
 const openingCash=Number(raw?.openingCash);
 const physicalCash=raw?.physicalCash===undefined||raw?.physicalCash===null||raw?.physicalCash===''?null:Number(raw.physicalCash);
 if(!Number.isSafeInteger(openingCash)||openingCash<0||openingCash>100000000)
  throw Error('Saldo inicial de efectivo inválido');
 if(physicalCash!==null&&(!Number.isSafeInteger(physicalCash)||physicalCash<0||physicalCash>100000000))
  throw Error('Efectivo contado inválido');
 return {day,openingCash,physicalCash,pendingReviewed:raw?.pendingReviewed===true};
}
export function summarizeCashRows(entries,openingCash=0){
 const totals={cashIn:0,cashOut:0,tefIn:0,tefOut:0};
 for(const entry of entries){
  const amount=Number(entry.amount),method=entry.method,direction=entry.direction;
  if(!Number.isSafeInteger(amount)||amount<=0||!['efectivo','tef'].includes(method)||!['in','out'].includes(direction))
   throw Error('Hay un movimiento de caja inválido');
  const key=(method==='efectivo'?'cash':'tef')+(direction==='in'?'In':'Out');
  totals[key]+=amount;
  if(!Number.isSafeInteger(totals[key]))throw Error('Monto de caja fuera de rango');
 }
 return {...totals,cashNet:totals.cashIn-totals.cashOut,tefNet:totals.tefIn-totals.tefOut,
   expectedCash:openingCash+totals.cashIn-totals.cashOut};
}
