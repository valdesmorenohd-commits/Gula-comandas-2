// Interfaz de operaciones compartidas para Gula 2.0.
// No sustituye los datos locales ni se activa en la versión publicada.
import {sharedSales} from './cloud-sales.mjs';
import {sharedMasterData} from './cloud-master-data.mjs';
import {openReceiptPrint} from './cloud-receipts.mjs';
import {downloadSharedBackup} from './cloud-backup.mjs';
import {buildSharedReport} from './cloud-reports.mjs';
import {loadSharedReportPeriod} from './cloud-report-loader.mjs';
import {downloadReportCsv} from './cloud-report-export.mjs';
import {canPerform} from './access-policy.mjs';
const safe=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clp=v=>'$'+Number(v||0).toLocaleString('es-CL');
const dayCL=value=>{
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
 return m?m[3]+'-'+m[2]+'-'+m[1]:String(value||'');
};
const el=(root,id)=>root.querySelector('[data-cloud="'+id+'"]');
const v=(root,id)=>el(root,id)?.value??'';
export function attachCloudWorkspace(root,firebaseApp,getUser,getAccess){
 const sales=sharedSales(firebaseApp);
 const master=sharedMasterData(firebaseApp);
 let products=[],orders=[],clients=[],inventory=[],cash=[],stops=[];
 let active=false,busy=false,selectedOrder=null,selectedProduct=null,cart=[];
 let selectedCategory='all';
 let ordersReady=false,cashReady=false,reportData=null,reportEpoch=0,lastCompleteReport=null,lastReportFilters=null;
 const pending=new Map();
 const cloudKinds={new:'createSaleOrder',editOrder:'editSaleOrder',payment:'recordSalePayment',
  adjust:'adjustSaleInventory',cancel:'cancelSaleOrder',closeOrder:'closeSaleOrder',
  reopenOrder:'reopenSaleOrder',refund:'recordSaleRefund',cash:'recordCashMovement',close:'closeCashDay'};
 function pendingKey(){return 'gula2_pending_ops_v1_'+(getUser()?.uid||'');}
 function loadPending(){
  pending.clear();
  if(!getUser()?.uid)return;
  try{
   const rows=JSON.parse(localStorage.getItem(pendingKey())||'{}');
   if(rows&&typeof rows==='object'&&!Array.isArray(rows)){
    for(const [kind,row] of Object.entries(rows)){
     if(typeof row?.key==='string'&&typeof row?.payload==='string'&&row.payload.length<30000)
      pending.set(kind,{key:row.key,payload:row.payload});
    }
   }
  }catch{}
 }
 function savePending(){
  if(!getUser()?.uid)return;
  localStorage.setItem(pendingKey(),JSON.stringify(Object.fromEntries(pending)));
 }
 function pendingNotice(){
  const unresolved=[...pending.keys()];
  const box=el(root,'pendingNotice');
  if(box)box.textContent=unresolved.length?
   'Operación sin confirmar: '+unresolved.join(', ')+'. No cambies sus datos: revisa el historial o reintenta exactamente la misma solicitud.':'';
 }
 function message(txt,kind=''){
  const e=el(root,'message'); if(e){e.textContent=txt;e.className=kind==='error'?'error':kind==='success'?'success':'muted sub'}
 }
 function access(){
  const u=getUser(),a=getAccess();
  if(!u||a?.status!=='active')throw Error('Tu sesión no tiene acceso activo a Gula');
  return {uid:u.uid,role:a.membership?.roleId};
 }
 function permission(requiredPermission=''){
  const u=access();
  if(requiredPermission&&!canPerform({authUid:u.uid,businessId:'gula',
   membership:getAccess().membership,permission:requiredPermission}))
   throw Error('Tu perfil no tiene el permiso '+requiredPermission);
  return u;
 }
 async function once(kind,payload,doWrite){
  if(busy)throw Error('Otra operación sigue en curso');
  const stable=JSON.stringify(payload);
  const existing=pending.get(kind);
  if(existing&&existing.payload!==stable)
   throw Error('Hay una operación anterior sin confirmar. Revisa su estado antes de cambiar los datos o importes.');
  const key=existing?.key||sales.newIdempotencyKey();
  if(!existing){
   pending.set(kind,{payload:stable,key});
   savePending();
  }
  pendingNotice();busy=true;
  message('Verificando y guardando de forma segura en Firebase…');
  try{
   // Un reintento puede haber llegado al servidor aunque el iPhone no recibiera la respuesta.
   if(existing&&cloudKinds[kind]){
    const status=await sales.checkOperation(cloudKinds[kind],key);
    if(status.confirmed){
     pending.delete(kind);savePending();pendingNotice();
     message('La operación anterior ya estaba registrada. No se ha duplicado.','success');
     return status.result;
    }
   }
   const result=await doWrite(key);
   pending.delete(kind);savePending();pendingNotice();
   message('Operación confirmada en Firebase.','success');
   return result;
  }catch(error){
   message('Operación sin confirmar: '+(error.message||error.code||error)+
    '. Conservamos su identificador para evitar duplicarla.','error');
   pendingNotice();
   throw error;
  }finally{busy=false}
 }
 function orderStatus(o){return o.status==='closed'?'Cerrada':o.status==='canceled'?'Anulada':o.paymentStatus==='paid'?'Pagada':o.paymentStatus==='partial'?'Abonada':'Pendiente'}
 function drawCustomerSuggestions(){
  const search=v(root,'customer').trim().toLocaleLowerCase('es-CL');
  const list=root.querySelector('#gulaCloudCustomerSuggestions');
  if(!list)return;
  list.replaceChildren();
  if(search.length<4){
   el(root,'customerHint').textContent='Escribe al menos 4 letras para buscar clientes; también puedes ingresar uno nuevo.';
   return;
  }
  const matches=clients.filter(x=>String(x.name||'').toLocaleLowerCase('es-CL').includes(search)).slice(0,8);
  for(const client of matches){
   const option=document.createElement('option');
   option.value=client.name;list.appendChild(option);
  }
  el(root,'customerHint').textContent=matches.length?
   matches.length+' cliente(s) encontrado(s). Selecciona uno o escribe un nombre diferente.':
   'No hay coincidencias. Puedes crear la comanda con este nombre.';
 }
 function stockSummary(productId,date,mode){
  if(mode==='dated'&&!date)return 'Selecciona la fecha de entrega para consultar existencias.';
  const id=productId+'__'+(mode==='dated'?date:'permanent');
  const record=inventory.find(i=>i.id===id);
  if(!record)return 'Stock no configurado para este producto'+(mode==='dated'?' en la fecha seleccionada':'')+'.';
  const qty=Number(record.quantity);
  if(!Number.isSafeInteger(qty)||qty<0)return 'Stock no válido: verifica existencias.';
  const requested=cart.filter(c=>c.productId===productId).reduce((n,c)=>n+c.quantity,0);
  return 'Existencias: '+qty+'. En el carrito: '+requested+
   '. Restarían aproximadamente '+(qty-requested)+'. La disponibilidad se confirma al guardar.';
 }
 function drawStockHint(){
  const product=products.find(p=>p.id===v(root,'product'));
  el(root,'stockHint').textContent=product?
   stockSummary(product.id,v(root,'date'),product.stockMode):
   'Selecciona un producto para consultar sus existencias.';
 }
 function drawProductCards(){
  const categories=[...new Set(products.filter(p=>p.active).map(p=>p.category||'Sin categoría'))];
  if(selectedCategory!=='all'&&!categories.includes(selectedCategory))selectedCategory='all';
  const filters=el(root,'categoryFilters');
  filters.innerHTML=[{label:'Todos',value:'all'},...categories.map(c=>({label:c,value:c}))].map(c=>
   '<button type="button" class="secondary" data-cloud-category="'+safe(c.value)+'" aria-pressed="'+(selectedCategory===c.value)+'">'+safe(c.label)+'</button>').join('');
  const list=products.filter(p=>p.active&&(selectedCategory==='all'||(p.category||'Sin categoría')===selectedCategory));
  el(root,'productCards').innerHTML=list.map(p=>{
   const photo=typeof p.photoUrl==='string'&&/^https:\/\//.test(p.photoUrl)?
     '<img src="'+safe(p.photoUrl)+'" alt="'+safe(p.name)+'" loading="lazy">':
     '<div class="cloud-product-placeholder">Sin fotografía</div>';
   return '<button type="button" class="cloud-product-card" data-cloud-pick-product="'+safe(p.id)+'" aria-pressed="'+(v(root,'product')===p.id)+'">'+
    photo+'<strong>'+safe(p.name)+'</strong><small>'+clp(p.price)+'</small></button>';
  }).join('')||'<p class="muted sub">No hay productos activos en esta categoría.</p>';
 }
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
  drawProductCards();drawStockHint();
  el(root,'productList').innerHTML=products.map(p=>'<div class="line"><b>'+safe(p.name)+'</b><span>'+clp(p.price)+' · '+(p.stockMode==='dated'?'Por fecha':'Permanente')+'</span></div>').join('')||'<p>Sin catálogo compartido.</p>';
 }
 function confirmOrderSummary(data,{edit=false}={}){
  const total=data.items.reduce((sum,line)=>{
   const p=products.find(x=>x.id===line.productId);
   const variation=(p?.options||[]).find(x=>x.name===line.option);
   if(!p||!p.active)throw Error('Hay un producto que ya no está disponible');
   return sum+line.quantity*(p.price+Number(variation?.extra||0));
  },0);
  const details=data.items.map(line=>{
   const p=products.find(x=>x.id===line.productId);
   return line.quantity+' × '+(p?.name||line.productId)+(line.option?' ('+line.option+')':'');
  });
  return window.confirm((edit?'¿Guardar cambios en la comanda seleccionada?':'¿Confirmar nueva comanda?')+
   '\nCliente: '+data.customer+'\nEntrega: '+dayCL(data.deliveryDate)+
   (data.deliveryWindow?' · '+data.deliveryWindow:'')+
   '\n\nProductos:\n'+details.join('\n')+
   '\n\nTotal estimado: '+clp(total)+
   '\nEl precio definitivo y el stock se verificarán al guardar en Firebase.');
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
  drawStockHint();
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
  el(root,'orders').innerHTML=rows.map(o=>{
   const statusClass=o.status==='canceled'?'void':o.paymentStatus==='paid'?'paid':
    o.paymentStatus==='partial'?'partial':'pending';
   return '<article class="panel cloud-order-card cloud-order-'+statusClass+'"><div class="line"><b>'+safe(o.number||o.id)+'</b><strong>'+clp(o.total)+'</strong></div>'+
    '<div class="muted sub">'+safe(o.customer)+' · '+safe(dayCL(o.deliveryDate))+'</div>'+
    '<div class="line"><span class="cloud-payment-state cloud-payment-'+statusClass+'">'+safe(orderStatus(o))+'</span>'+
    '<strong>Saldo '+clp(o.balance)+'</strong></div>'+
    '<div class="sub">Abonado: '+clp(o.paidTotal)+'</div>'+
    '<div class="buttons"><button class="secondary" type="button" data-cloud-order="'+safe(o.id)+'">Gestionar</button>'+
    '<button class="secondary" type="button" data-cloud-print="'+safe(o.id)+'">Imprimir cliente</button>'+
    '<button class="secondary" type="button" data-cloud-kitchen="'+safe(o.id)+'">Cocina</button></div></article>'
  }).join('')||'<p class="muted">Sin comandas compartidas.</p>';
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
 function reportFilters(){
  return {from:v(root,'reportFrom'),to:v(root,'reportTo'),
   dateType:v(root,'reportDateType'),customer:v(root,'reportCustomer'),
   status:v(root,'reportStatus')};
 }
 function invalidateReport({data=false}={}){
  lastCompleteReport=null;lastReportFilters=null;
  reportEpoch++;
  if(data)reportData=null;
 }
 function drawCloudReport(){
  const admin=getAccess()?.membership?.roleId==='principal_admin';
  lastCompleteReport=null;lastReportFilters=null;
  const warning=el(root,'reportWarning'),summary=el(root,'reportSummary'),detail=el(root,'reportProducts');
  if(!ordersReady||(admin&&!cashReady)){
   warning.textContent='Cargando comandas y movimientos de Firebase…';
   summary.replaceChildren();detail.replaceChildren();return;
  }
  try{
   const from=v(root,'reportFrom'),to=v(root,'reportTo'),dateType=v(root,'reportDateType');
   const loaded=reportData&&reportData.from===from&&reportData.to===to&&reportData.dateType===dateType;
   const dataset=loaded?reportData:null;
   const r=buildSharedReport({orders:dataset?.orders||orders,
    cashEntries:admin?(dataset?.cashEntries||cash):[],
    from,to,dateType,customer:v(root,'reportCustomer'),
    status:v(root,'reportStatus'),
    orderLimit:loaded?5001:200,cashLimit:loaded?5001:200});
   const labels=[
    ['Comandas activas',r.activeCount],['Anuladas',r.canceled],
    ['Venta según fecha de comanda',clp(r.sales)],
    ['Saldo de comandas seleccionadas',clp(r.receivable)],
    ['Devoluciones pendientes',clp(r.refundPending)]
   ];
   if(admin)labels.push(
    ['Cobrado en el período',clp(r.payments)],
    ['Devoluciones efectuadas',clp(r.refunds)],
    ['Efectivo recibido',clp(r.cashIn)],['Efectivo salido',clp(r.cashOut)],
    ['TEF recibido',clp(r.tefIn)],['TEF devuelto/salido',clp(r.tefOut)],
    ['Retiros',clp(r.withdrawals)],['Otros egresos',clp(r.expenses)]);
   summary.innerHTML='<div class="grid">'+labels.map(([title,value])=>
    '<div class="kpi"><small>'+safe(title)+'</small><b>'+safe(value)+'</b></div>').join('')+'</div>';
   detail.innerHTML='<h3>Productos vendidos en las comandas seleccionadas</h3>'+
    (r.products.length?'<div class="tablewrap"><table><thead><tr><th>Producto</th><th>Unidades</th><th>Importe</th></tr></thead><tbody>'+
     r.products.slice(0,30).map(p=>'<tr><td>'+safe(p.name)+'</td><td>'+p.units+'</td><td>'+clp(p.total)+'</td></tr>').join('')+
     '</tbody></table></div>':'<p class="muted sub">No hay productos vendidos en esta selección.</p>');
   if(loaded&&!dataset.partialOrders&&!dataset.partialCash){
    lastCompleteReport=r;
    lastReportFilters=JSON.stringify(reportFilters());
   }
   const issues=[];
   if(!loaded){
    issues.push('Vista rápida de solo las 200 comandas más recientes; selecciona fechas y pulsa Actualizar informe para consultar el período');
   }else if(dataset.partialOrders||dataset.partialCash){
    issues.push('El período supera el límite de 5.000 registros por colección; utiliza un rango menor');
   }
   if(!admin)issues.push('El detalle de movimientos de caja solo está disponible para administración');
   warning.textContent=issues.length?'Vista parcial: '+issues.join('; ')+'. No utilizar como cierre contable definitivo.':
    'Consulta del período completada. Los cobros se atribuyen al día de su movimiento, no al día de entrega.';
  }catch(e){
   warning.textContent='No se pudo calcular el informe: '+(e?.message||e);
   summary.replaceChildren();detail.replaceChildren();
  }
 }
 function drawClients(){
  const c=v(root,'clientEdit');
  el(root,'clientEdit').innerHTML='<option value="">Nuevo cliente</option>'+clients.map(x=>'<option value="'+safe(x.id)+'">'+safe(x.name)+'</option>').join('');
  if(clients.some(x=>x.id===c))el(root,'clientEdit').value=c;
  drawCustomerSuggestions();
  el(root,'clientCount').textContent=clients.length+' clientes compartidos';
 }
 function begin(){
  if(active)return;
  try{access()}catch{return}
  active=true;ordersReady=false;cashReady=false;reportData=null;reportEpoch++;loadPending();pendingNotice();drawCloudReport();message('Conectando datos compartidos…');
  const onError=e=>message('No fue posible leer Firebase: '+(e?.code||e?.message||e),'error');
  stops=[
   master.watchProducts(rows=>{products=rows;drawProducts();drawInventory();renderCart()},onError),
   master.watchClients(rows=>{clients=rows;drawClients()},onError),
   sales.watchOrders(rows=>{orders=rows;ordersReady=true;invalidateReport({data:true});drawOrders();drawCloudReport();message('Datos compartidos actualizados; vuelve a consultar el informe si necesitas exportarlo.','success')},onError),
   sales.watchInventory(rows=>{inventory=rows;drawInventory();drawStockHint()},onError)
  ];
  if(getAccess()?.membership?.roleId==='principal_admin'){
   stops.push(sales.watchCash(rows=>{cash=rows;cashReady=true;invalidateReport({data:true});drawInventory();drawCloudReport()},onError));
  }
 }
 function stop(){
  stops.forEach(f=>{try{f()}catch{}});stops=[];active=false;busy=false;
  selectedOrder=null;selectedProduct=null;pending.clear();
  products=[];orders=[];clients=[];inventory=[];cash=[];ordersReady=false;cashReady=false;reportData=null;lastCompleteReport=null;reportEpoch++;cart=[];renderCart();
 }
 function parseAmount(id){
  const n=Number(v(root,id));if(!Number.isSafeInteger(n)||n<=0)throw Error('Monto inválido');
  return n;
 }
 async function checkAllPending(){
  if(busy)throw Error('Otra operación está en curso');
  const relevant=[...pending.entries()].filter(([kind])=>cloudKinds[kind]);
  if(!relevant.length){message('No hay pagos ni comandas pendientes de confirmar.','success');return}
  busy=true;
  let confirmed=0,unconfirmed=0,unavailable=0;
  try{
   for(const [kind,row] of relevant){
    try{
     const status=await sales.checkOperation(cloudKinds[kind],row.key);
     if(status.confirmed){pending.delete(kind);confirmed++}
     else unconfirmed++;
    }catch(error){unavailable++}
   }
   savePending();pendingNotice();
   if(unavailable)message('Se confirmaron '+confirmed+' operaciones. '+unavailable+
    ' no pudieron consultarse; no repitas esos cobros hasta recuperar la conexión.','error');
   else if(unconfirmed)message('Confirmadas: '+confirmed+'. Sin registrar: '+unconfirmed+
    '. Puedes reintentar con la misma solicitud, sin cambiar importes.','error');
   else message('Operaciones verificadas: '+confirmed+' confirmadas. No se ha repetido ningún cobro.','success');
  }finally{busy=false}
 }
 async function perform(action){
  if(!active)throw Error('El módulo compartido aún no está conectado');
  const u=permission();
  if(action==='exportReport'){
   if(!lastCompleteReport||lastReportFilters!==JSON.stringify(reportFilters()))
    throw Error('Los filtros del informe han cambiado. Consulta de nuevo el período antes de exportar');
   downloadReportCsv(lastCompleteReport,{showCash:getAccess()?.membership?.roleId==='principal_admin'});
   message('Informe CSV preparado. Puedes abrirlo en Excel.','success');
   return;
  }
  if(action==='report'){
   const from=v(root,'reportFrom'),to=v(root,'reportTo'),dateType=v(root,'reportDateType');
   if(!from||!to)throw Error('Selecciona las fechas desde y hasta para consultar el período');
   const epoch=reportEpoch;
   message('Consultando el período por páginas en Firebase…');
   const data=await loadSharedReportPeriod(firebaseApp,{from,to,dateType,
    principal:getAccess()?.membership?.roleId==='principal_admin'});
   if(epoch!==reportEpoch||!active)return;
   reportData=data;
   drawCloudReport();
   message('Período consultado: '+data.orders.length+' comandas'+
    (getAccess()?.membership?.roleId==='principal_admin'?' y '+data.cashEntries.length+' movimientos de caja':'')+'.','success');
   return;
  }
  if(action==='checkPending'){
   await checkAllPending();return;
  }
  if(action==='quickClient'){
   permission('clients.manage');
   const name=v(root,'customer').trim();
   if(name.length<2||name.length>100)throw Error('Escribe un nombre de cliente válido');
   const match=clients.find(c=>String(c.name||'').trim().toLocaleLowerCase('es-CL')===name.toLocaleLowerCase('es-CL'));
   if(match){message('Este cliente ya existe en el catálogo.','success');return}
   const data={name,phone:'',notes:''};
   await once('quickClient',data,key=>master.addClient(getUser(),data,key));
   message('Cliente guardado en el catálogo compartido.','success');
   return;
  }
  if(action==='addLine'){
   addCartLine();return;
  }
  if(action==='new'){
   permission('orders.create');
   if(!cart.length)throw Error('Agrega al menos un producto a la comanda');
   const data={
    customer:v(root,'customer').trim(),deliveryDate:v(root,'date'),
    deliveryWindow:v(root,'window'),notes:v(root,'notes'),
    items:cart.map(x=>({...x}))
   };
   if(!confirmOrderSummary(data))return;
   const result=await once('new',data,key=>sales.createOrder(data,key));
   selectedOrder=result.id;cart=[];renderCart();
   el(root,'selectedOrder').textContent=result.number+' · Guardada';
  }else if(action==='editOrder'){
   permission('orders.edit');
   if(!selectedOrder)throw Error('Selecciona una comanda para editar');
   if(!cart.length)throw Error('Agrega productos al carrito para reemplazar la selección del pedido');
   const payload={orderId:selectedOrder,customer:v(root,'customer').trim(),
    deliveryDate:v(root,'date'),deliveryWindow:v(root,'window'),notes:v(root,'notes'),
    items:cart.map(line=>({...line}))};
   if(!confirmOrderSummary(payload,{edit:true}))return;
   await once('editOrder',payload,key=>sales.editOrder(payload.orderId,payload,key));
   cart=[];renderCart();
  }else if(action==='payment'){
   permission('payments.record');
   if(!selectedOrder)throw Error('Primero selecciona una comanda');
   const payload={orderId:selectedOrder,amount:parseAmount('amount'),method:v(root,'method')};
   await once('payment',payload,key=>sales.recordPayment(payload.orderId,payload.amount,payload.method,key));
  }else if(action==='closeOrder'){
   permission('orders.close');
   if(!selectedOrder)throw Error('Selecciona una comanda');
   const payload={orderId:selectedOrder};
   await once('closeOrder',payload,key=>sales.closeOrder(payload.orderId,key));
  }else if(action==='reopenOrder'){
   if(!selectedOrder)throw Error('Selecciona una comanda');
   permission('orders.reopen');
   const payload={orderId:selectedOrder,reason:v(root,'reopenReason')};
   await once('reopenOrder',payload,key=>sales.reopenOrder(payload.orderId,payload.reason,key));
  }else if(action==='cancel'){
   if(!selectedOrder)throw Error('Selecciona una comanda');
   permission('orders.cancel');
   const payload={orderId:selectedOrder,reason:v(root,'reason')};
   await once('cancel',payload,key=>sales.cancelOrder(payload.orderId,payload.reason,key));
  }else if(action==='refund'){
   if(!selectedOrder)throw Error('Selecciona una comanda');
   permission('refunds.record');
   const payload={orderId:selectedOrder,amount:parseAmount('refundAmount'),method:v(root,'refundMethod')};
   await once('refund',payload,key=>sales.recordRefund(payload.orderId,payload.amount,payload.method,key));
  }else if(action==='adjust'){
   permission('inventory.adjust');
   const payload={productId:v(root,'inventoryProduct'),date:v(root,'inventoryDate'),delta:Number(v(root,'inventoryDelta')),
     reason:v(root,'inventoryReason')};
   await once('adjust',payload,key=>sales.adjustInventory(payload.productId,payload.date,payload.delta,payload.reason,key));
  }else if(action==='cash'){
   permission('cash.manage');
   const payload={direction:v(root,'cashDirection'),category:v(root,'cashCategory'),note:v(root,'cashNote'),
    amount:parseAmount('cashAmount'),method:v(root,'cashMethod')};
   await once('cash',payload,key=>sales.recordCashMovement(payload,key));
  }else if(action==='product'){
   permission('products.manage');
   const id=v(root,'productEdit');
   const original=products.find(p=>p.id===id);
   const data={name:v(root,'productName'),category:v(root,'productCategory'),
    price:Number(v(root,'productPrice')),stockMode:v(root,'stockMode'),
    photoUrl:original?.photoUrl||'',active:original?.active??true,
    options:parseProductOptions(v(root,'productOptions'))};
   await once('product',{id,...data},key=>id?master.editProduct(getUser(),id,data):master.addProduct(getUser(),data,key));
  }else if(action==='client'){
   permission('clients.manage');
   const id=v(root,'clientEdit'),data={name:v(root,'clientName'),phone:v(root,'clientPhone'),notes:v(root,'clientNotes')};
   await once('client',{id,...data},key=>id?master.editClient(getUser(),id,data):master.addClient(getUser(),data,key));
  }else if(action==='preview'){
   const result=await sales.previewCashDay(v(root,'closeDay'),Number(v(root,'openingCash')));
   el(root,'closePreview').textContent=JSON.stringify(result,null,2);
   message('Previsualización de caja disponible.');
  }else if(action==='backup'){
   permission('users.manage');
   const result=await downloadSharedBackup(firebaseApp,{uid:u.uid,principal:true});
   message('Respaldo generado: '+Object.values(result.counts).reduce((n,x)=>n+x,0)+' registros. Guarda el archivo en un lugar privado.','success');
  }else if(action==='close'){
   permission('cash.close');
   const data={day:v(root,'closeDay'),openingCash:Number(v(root,'openingCash')),
    physicalCash:v(root,'physicalCash')===''?null:Number(v(root,'physicalCash')),
    pendingReviewed:el(root,'pendingReviewed').checked};
   await once('close',data,key=>sales.closeCashDay(data,key));
  }
 }
 root.addEventListener('click',async event=>{
  const order=event.target.closest('[data-cloud-order]');
  const category=event.target.closest('[data-cloud-category]');
  if(category){selectedCategory=category.dataset.cloudCategory;drawProductCards();return}
  const picked=event.target.closest('[data-cloud-pick-product]');
  if(picked){
   el(root,'product').value=picked.dataset.cloudPickProduct;
   drawProducts();return;
  }
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
  if(e.target.matches('[data-cloud="date"]'))drawStockHint();
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
 root.addEventListener('input',e=>{
  if(e.target.matches('[data-cloud="search"]'))drawOrders();
  if(e.target.matches('[data-cloud="customer"]'))drawCustomerSuggestions();
  if(e.target.matches('[data-cloud^="report"]')){
   invalidateReport();
   el(root,'reportWarning').textContent='Los filtros han cambiado. Pulsa Consultar período en Firebase para actualizar y exportar.';
  }
 });
 root.addEventListener('change',e=>{
  if(e.target.matches('[data-cloud^="report"]')){
   invalidateReport();
   el(root,'reportWarning').textContent='Vuelve a consultar el período antes de exportar.';
  }
 });
 return {start:begin,stop,isActive:()=>active};
}
