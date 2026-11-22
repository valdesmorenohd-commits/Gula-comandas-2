// Interfaz de operaciones compartidas para Gula 2.0.
// No sustituye los datos locales ni se activa en la versión publicada.
import {sharedSales} from './cloud-sales.mjs';
import {sharedMasterData} from './cloud-master-data.mjs';
import {openReceiptPrint} from './cloud-receipts.mjs';
import {downloadSharedBackup} from './cloud-backup.mjs';
const safe=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clp=v=>'$'+Number(v||0).toLocaleString('es-CL');
const el=(root,id)=>root.querySelector('[data-cloud="'+id+'"]');
const v=(root,id)=>el(root,id)?.value??'';
export function attachCloudWorkspace(root,firebaseApp,getUser,getAccess){
 const sales=sharedSales(firebaseApp);
 const master=sharedMasterData(firebaseApp);
 let products=[],orders=[],clients=[],inventory=[],cash=[],stops=[];
 let active=false,busy=false,selectedOrder=null,selectedProduct=null,cart=[];
 const pending=new Map();
 function message(txt,kind=''){
  const e=el(root,'message'); if(e){e.textContent=txt;e.className=kind==='error'?'error':kind==='success'?'success':'muted sub'}
 }
 function access(){
  const u=getUser(),a=getAccess();
  if(!u||a?.status!=='active')throw Error('Tu sesión no tiene acceso activo a Gula');
  return {uid:u.uid,role:a.membership?.roleId};
 }
 function permission(write=false){
  const u=access();
  if(write&&u.role==='consulta')throw Error('Tu perfil es de solo consulta');
  return u;
 }
 function once(kind,payload,doWrite){
  if(busy)throw Error('Otra operación sigue en curso');
  busy=true;
  const stable=JSON.stringify(payload);
  const existing=pending.get(kind);
  const key=existing?.payload===stable?existing.key:sales.newIdempotencyKey();
  pending.set(kind,{payload:stable,key});
  message('Guardando de forma segura en Firebase…');
  return Promise.resolve().then(()=>doWrite(key)).then(result=>{
   pending.delete(kind);message('Operación confirmada en Firebase.','success');
   return result;
  }).catch(error=>{
   message('No confirmado: '+(error.message||error.code||error)+'. No repitas la operación hasta comprobar el historial.','error');
   throw error;
  }).finally(()=>{busy=false});
 }
 function orderStatus(o){return o.status==='closed'?'Cerrada':o.status==='canceled'?'Anulada':o.paymentStatus==='paid'?'Pagada':o.paymentStatus==='partial'?'Abonada':'Pendiente'}
 function drawProducts(){
  const option=el(root,'product');
  const choice=v(root,'product'),start=option?.value;
  option.innerHTML='<option value="">Selecciona un producto</option>'+products.filter(p=>p.active).map(p=>'<option value="'+safe(p.id)+'">'+safe(p.name)+' · '+clp(p.price)+'</option>').join('');
  if(products.some(p=>p.id===choice))option.value=choice;
  const prod=products.find(p=>p.id===option.value);
  const variation=el(root,'option'),selected=variation.value;
  variation.innerHTML='<option value="">Sin opción</option>'+((prod?.options||[]).map(o=>'<option value="'+safe(o.name)+'">'+safe(o.name)+(o.extra?' + '+clp(o.extra):'')+'</option>').join(''));
  if((prod?.options||[]).some(o=>o.name===selected))variation.value=selected;
  if(prod?.options?.length)variation.value=variation.value||prod.options[0].name;
  const editProduct=el(root,'productEdit'),previousProduct=editProduct.value;
  editProduct.innerHTML='<option value="">Nuevo producto</option>'+
   products.map(p=>'<option value="'+safe(p.id)+'">'+safe(p.name)+'</option>').join('');
  if(products.some(p=>p.id===previousProduct))editProduct.value=previousProduct;
  el(root,'productCount').textContent=products.length+' productos compartidos';
  el(root,'productList').innerHTML=products.map(p=>'<div class="line"><b>'+safe(p.name)+'</b><span>'+clp(p.price)+' · '+(p.stockMode==='dated'?'Por fecha':'Permanente')+'</span></div>').join('')||'<p>Sin catálogo compartido.</p>';
 }
 function renderCart(){
  const box=el(root,'cart');
  if(!box)return;
  const sum=cart.reduce((n,line)=>{
   const p=products.find(x=>x.id===line.productId);
   const option=(p?.options||[]).find(x=>x.name===line.option);
   return n+line.quantity*(Number(p?.price||0)+Number(option?.extra||0));
  },0);
  box.innerHTML=cart.map((line,i)=>{
   const p=products.find(x=>x.id===line.productId);
   return '<div class="line"><span>'+safe(line.quantity)+' × '+safe(p?.name||line.productId)+
     (line.option?' · '+safe(line.option):'')+'</span><button class="secondary" type="button" data-cloud-remove="'+i+'">Quitar</button></div>';
  }).join('')||'<p class="muted sub">Agrega productos al pedido.</p>';
  el(root,'cartTotal').textContent='Total estimado: '+clp(sum)+' (se confirmará en el servidor)';
 }
 function addCartLine(){
  const productId=v(root,'product'),quantity=parseAmount('quantity'),option=v(root,'option');
  const prod=products.find(p=>p.id===productId&&p.active);
  if(!prod)throw Error('Selecciona un producto disponible');
  if(quantity>99)throw Error('Máximo 99 unidades');
  if(prod.options?.length&&!prod.options.some(o=>o.name===option))throw Error('Selecciona una opción válida');
  if(cart.length>=20)throw Error('Máximo 20 líneas por comanda');
  const current=cart.find(line=>line.productId===productId&&line.option===option);
  if(current){
   if(current.quantity+quantity>99)throw Error('Máximo 99 unidades por variante');
   current.quantity+=quantity;
  }else cart.push({productId,quantity,option});
  renderCart();
 }
 function drawOrders(){
  const q=v(root,'search').toLowerCase();
  const rows=orders.filter(o=>!q||String(o.customer||'').toLowerCase().includes(q)||String(o.number||'').toLowerCase().includes(q));
  el(root,'orders').innerHTML=rows.map(o=>'<article class="panel"><div class="line"><b>'+safe(o.number||o.id)+'</b><strong>'+clp(o.total)+'</strong></div>'+
    '<div class="muted sub">'+safe(o.customer)+' · '+safe(o.deliveryDate)+' · '+safe(orderStatus(o))+'</div>'+
    '<div class="sub">Abonado: '+clp(o.paidTotal)+' · Saldo: '+clp(o.balance)+'</div>'+
    '<div class="buttons"><button class="secondary" type="button" data-cloud-order="'+safe(o.id)+'">Gestionar</button>'+
    '<button class="secondary" type="button" data-cloud-print="'+safe(o.id)+'">Imprimir cliente</button>'+
    '<button class="secondary" type="button" data-cloud-kitchen="'+safe(o.id)+'">Cocina</button></div></article>').join('')||'<p class="muted">Sin comandas compartidas.</p>';
  if(selectedOrder){
   const order=orders.find(o=>o.id===selectedOrder);
   if(order){el(root,'selectedOrder').textContent=order.number+' · '+order.customer+' · Saldo '+clp(order.balance);return}
  }
  el(root,'selectedOrder').textContent='Selecciona una comanda del historial';
 }
 function drawInventory(){
  el(root,'inventoryList').innerHTML=inventory.map(x=>'<div class="line"><span>'+safe(products.find(p=>p.id===x.productId)?.name||x.productId)+' · '+safe(x.stockDate||'Permanente')+'</span><b>'+Number(x.quantity||0)+'</b></div>').join('')||'<p class="muted">Todavía no hay stock compartido.</p>';
  const choice=v(root,'inventoryProduct');
  el(root,'inventoryProduct').innerHTML=products.map(p=>'<option value="'+safe(p.id)+'">'+safe(p.name)+'</option>').join('');
  if(products.some(p=>p.id===choice))el(root,'inventoryProduct').value=choice;
  const cashSum=cash.reduce((n,m)=>n+(m.direction==='in'?1:-1)*Number(m.amount||0),0);
  el(root,'cashTotal').textContent='Movimiento neto consultado: '+clp(cashSum);
 }
 function parseProductOptions(raw){
  const rows=String(raw||'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
  if(rows.length>20)throw Error('Máximo 20 opciones por producto');
  const seen=new Set();
  return rows.map(row=>{
   const parts=row.split('|');
   if(parts.length!==2)throw Error('Cada opción debe tener formato Nombre|recargo');
   const name=parts[0].trim(),extraRaw=parts[1].trim(),extra=Number(extraRaw);
   if(!name||name.length>80||!/^[0-9]+$/.test(extraRaw)||!Number.isSafeInteger(extra)||extra>1000000)
    throw Error('Nombre o recargo de opción inválidos');
   const key=name.toLocaleLowerCase('es-CL');
   if(seen.has(key))throw Error('Hay opciones duplicadas');
   seen.add(key);
   return {name,extra};
  });
 }
 function drawClients(){
  const c=v(root,'clientEdit');
  el(root,'clientEdit').innerHTML='<option value="">Nuevo cliente</option>'+clients.map(x=>'<option value="'+safe(x.id)+'">'+safe(x.name)+'</option>').join('');
  if(clients.some(x=>x.id===c))el(root,'clientEdit').value=c;
  el(root,'clientCount').textContent=clients.length+' clientes compartidos';
 }
 function begin(){
  if(active)return;
  try{access()}catch{return}
  active=true;message('Conectando datos compartidos…');
  const onError=e=>message('No fue posible leer Firebase: '+(e?.code||e?.message||e),'error');
  stops=[
   master.watchProducts(rows=>{products=rows;drawProducts();drawInventory();renderCart()},onError),
   master.watchClients(rows=>{clients=rows;drawClients()},onError),
   sales.watchOrders(rows=>{orders=rows;drawOrders();message('Datos compartidos actualizados.','success')},onError),
   sales.watchInventory(rows=>{inventory=rows;drawInventory()},onError)
  ];
  if(getAccess()?.membership?.roleId==='principal_admin'){
   stops.push(sales.watchCash(rows=>{cash=rows;drawInventory()},onError));
  }
 }
 function stop(){
  stops.forEach(f=>{try{f()}catch{}});stops=[];active=false;busy=false;
  selectedOrder=null;selectedProduct=null;pending.clear();
  products=[];orders=[];clients=[];inventory=[];cash=[];cart=[];renderCart();
 }
 function parseAmount(id){
  const n=Number(v(root,id));if(!Number.isSafeInteger(n)||n<=0)throw Error('Monto inválido');
  return n;
 }
 async function perform(action){
  if(!active)throw Error('El módulo compartido aún no está conectado');
  const u=permission(action!=='print');
  if(action==='addLine'){
   addCartLine();return;
  }
  if(action==='new'){
   if(!cart.length)throw Error('Agrega al menos un producto a la comanda');
   const data={
    customer:v(root,'customer').trim(),deliveryDate:v(root,'date'),
    deliveryWindow:v(root,'window'),notes:v(root,'notes'),
    items:cart.map(x=>({...x}))
   };
   const result=await once('new',data,key=>sales.createOrder(data,key));
   selectedOrder=result.id;cart=[];renderCart();
   el(root,'selectedOrder').textContent=result.number+' · Guardada';
  }else if(action==='editOrder'){
   if(!selectedOrder)throw Error('Selecciona una comanda para editar');
   if(!cart.length)throw Error('Agrega productos al carrito para reemplazar la selección del pedido');
   const payload={orderId:selectedOrder,customer:v(root,'customer').trim(),
    deliveryDate:v(root,'date'),deliveryWindow:v(root,'window'),notes:v(root,'notes'),
    items:cart.map(line=>({...line}))};
   await once('editOrder',payload,key=>sales.editOrder(payload.orderId,payload,key));
   cart=[];renderCart();
  }else if(action==='payment'){
   if(!selectedOrder)throw Error('Primero selecciona una comanda');
   const payload={orderId:selectedOrder,amount:parseAmount('amount'),method:v(root,'method')};
   await once('payment',payload,key=>sales.recordPayment(payload.orderId,payload.amount,payload.method,key));
  }else if(action==='closeOrder'){
   if(!selectedOrder)throw Error('Selecciona una comanda');
   const payload={orderId:selectedOrder};
   await once('closeOrder',payload,key=>sales.closeOrder(payload.orderId,key));
  }else if(action==='reopenOrder'){
   if(!selectedOrder)throw Error('Selecciona una comanda');
   if(u.role!=='principal_admin')throw Error('Solo administración puede reabrir comandas');
   const payload={orderId:selectedOrder,reason:v(root,'reopenReason')};
   await once('reopenOrder',payload,key=>sales.reopenOrder(payload.orderId,payload.reason,key));
  }else if(action==='cancel'){
   if(!selectedOrder)throw Error('Selecciona una comanda');
   if(u.role!=='principal_admin')throw Error('Solo administración puede anular comandas');
   const payload={orderId:selectedOrder,reason:v(root,'reason')};
   await once('cancel',payload,key=>sales.cancelOrder(payload.orderId,payload.reason,key));
  }else if(action==='refund'){
   if(!selectedOrder)throw Error('Selecciona una comanda');
   if(u.role!=='principal_admin')throw Error('Solo administración puede devolver dinero');
   const payload={orderId:selectedOrder,amount:parseAmount('refundAmount'),method:v(root,'refundMethod')};
   await once('refund',payload,key=>sales.recordRefund(payload.orderId,payload.amount,payload.method,key));
  }else if(action==='adjust'){
   const payload={productId:v(root,'inventoryProduct'),date:v(root,'inventoryDate'),delta:Number(v(root,'inventoryDelta')),
     reason:v(root,'inventoryReason')};
   await once('adjust',payload,key=>sales.adjustInventory(payload.productId,payload.date,payload.delta,payload.reason,key));
  }else if(action==='cash'){
   const payload={direction:v(root,'cashDirection'),category:v(root,'cashCategory'),note:v(root,'cashNote'),
    amount:parseAmount('cashAmount'),method:v(root,'cashMethod')};
   await once('cash',payload,key=>sales.recordCashMovement(payload,key));
  }else if(action==='product'){
   if(u.role!=='principal_admin')throw Error('Solo administración puede modificar el catálogo');
   const id=v(root,'productEdit');
   const original=products.find(p=>p.id===id);
   const data={name:v(root,'productName'),category:v(root,'productCategory'),
    price:Number(v(root,'productPrice')),stockMode:v(root,'stockMode'),
    photoUrl:original?.photoUrl||'',active:original?.active??true,
    options:parseProductOptions(v(root,'productOptions'))};
   await once('product',{id,...data},key=>id?master.editProduct(getUser(),id,data):master.addProduct(getUser(),data,key));
  }else if(action==='client'){
   const id=v(root,'clientEdit'),data={name:v(root,'clientName'),phone:v(root,'clientPhone'),notes:v(root,'clientNotes')};
   await once('client',{id,...data},key=>id?master.editClient(getUser(),id,data):master.addClient(getUser(),data,key));
  }else if(action==='preview'){
   const result=await sales.previewCashDay(v(root,'closeDay'),Number(v(root,'openingCash')));
   el(root,'closePreview').textContent=JSON.stringify(result,null,2);
   message('Previsualización de caja disponible.');
  }else if(action==='backup'){
   if(u.role!=='principal_admin')throw Error('Solo administración puede exportar el respaldo');
   const result=await downloadSharedBackup(firebaseApp,{uid:u.uid,principal:true});
   message('Respaldo generado: '+Object.values(result.counts).reduce((n,x)=>n+x,0)+' registros. Guarda el archivo en un lugar privado.','success');
  }else if(action==='close'){
   if(u.role!=='principal_admin')throw Error('Solo administración puede cerrar caja');
   const data={day:v(root,'closeDay'),openingCash:Number(v(root,'openingCash')),
    physicalCash:v(root,'physicalCash')===''?null:Number(v(root,'physicalCash')),
    pendingReviewed:el(root,'pendingReviewed').checked};
   await once('close',data,key=>sales.closeCashDay(data,key));
  }
 }
 root.addEventListener('click',async event=>{
  const order=event.target.closest('[data-cloud-order]');
  const remove=event.target.closest('[data-cloud-remove]');
  if(remove){
   cart.splice(Number(remove.dataset.cloudRemove),1);renderCart();return;
  }
  const print=event.target.closest('[data-cloud-print],[data-cloud-kitchen]');
  if(order){
   selectedOrder=order.dataset.cloudOrder;
   const data=orders.find(o=>o.id===selectedOrder);
   if(data){
    el(root,'customer').value=data.customer||'';
    el(root,'date').value=data.deliveryDate||'';
    el(root,'window').value=data.deliveryWindow||'';
    el(root,'notes').value=data.notes||'';
    cart=(data.items||[]).map(i=>({productId:i.productId,option:i.option||'',quantity:i.quantity}));
    renderCart();
   }
   drawOrders();return;
  }
  if(print){
   const o=orders.find(o=>o.id===(print.dataset.cloudPrint||print.dataset.cloudKitchen));
   if(!o)return;
   try{openReceiptPrint(o,{type:print.dataset.cloudKitchen?'kitchen':'customer',widthMm:58})}
   catch(e){message(e.message,'error')}
   return;
  }
  const action=event.target.closest('[data-cloud-action]');
  if(!action)return;
  event.preventDefault();
  action.disabled=true;
  try{await perform(action.dataset.cloudAction)}catch(err){if(!/No confirmado/.test(el(root,'message')?.textContent||''))message(err.message||String(err),'error')}
  finally{action.disabled=false}
 });
 root.addEventListener('change',e=>{
  if(e.target.matches('[data-cloud="product"]'))drawProducts();
  if(e.target.matches('[data-cloud="productEdit"]')){
   const p=products.find(x=>x.id===e.target.value);
   if(!p)return;
   for(const [field,property] of [['productName','name'],['productCategory','category'],['productPrice','price'],['stockMode','stockMode']])
    el(root,field).value=p[property]??'';
   el(root,'productOptions').value=(p.options||[]).map(o=>o.name+'|'+o.extra).join('\n');
  }
  if(e.target.matches('[data-cloud="clientEdit"]')){
   const c=clients.find(x=>x.id===e.target.value);
   if(!c)return;
   for(const [field,property] of [['clientName','name'],['clientPhone','phone'],['clientNotes','notes']])
    el(root,field).value=c[property]??'';
  }
 });
 root.addEventListener('input',e=>{if(e.target.matches('[data-cloud="search"]'))drawOrders()});
 return {start:begin,stop,isActive:()=>active};
}
