// Plantillas de comprobante de Gula para impresora térmica de 58 mm.
// El navegador abre su diálogo de impresión; NO implementa conexión Bluetooth nativa.
const escapeHtml=(v)=>String(v??'').replace(/[&<>"']/g,ch=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));
const clp=(n)=>'$'+Number(n||0).toLocaleString('es-CL',{maximumFractionDigits:0});
const safeInt=(v)=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):0;
const status=(key)=>({'pending':'Pendiente','partial':'Abonado','paid':'Pagado'}[key]||'Pendiente');
export function receiptHtml(order,{type='customer',brand='GULA',widthMm=58}={}){
 if(type!=='customer'&&type!=='kitchen')throw Error('Tipo de comanda inválido');
 if(widthMm!==58&&widthMm!==80)throw Error('El papel debe ser de 58 u 80 mm');
 if(!order||typeof order!=='object'||!Array.isArray(order.items)||!order.items.length)
  throw Error('Comanda inválida');
 const kitchen=type==='kitchen';
 const items=order.items.map(i=>{
  const qty=safeInt(i.quantity),name=escapeHtml(i.name);
  if(qty<1||!name)throw Error('Línea de comanda inválida');
  const lineTotal=qty*safeInt(i.price);
  return '<tr><td>'+qty+' × '+name+'</td>'+(kitchen?'':'<td class="right">'+clp(lineTotal)+'</td>')+'</tr>';
 }).join('');
 const total=safeInt(order.total),paid=safeInt(order.paidTotal),balance=safeInt(order.balance);
 const heading=kitchen?'COCINA':'COMPROBANTE CLIENTE';
 const notes=String(order.notes||'').trim();
 const rows=kitchen?'':`
 <div class="total"><span>TOTAL</span><strong>${clp(total)}</strong></div>
 <div class="total"><span>Abonado</span><span>${clp(paid)}</span></div>
 <div class="total"><span>Saldo</span><strong>${clp(balance)}</strong></div>
 <div class="meta">Estado de pago: ${escapeHtml(status(order.paymentStatus))}</div>`;
 return `<!doctype html><html lang="es"><head><meta charset="utf-8">
 <meta name="viewport" content="width=device-width,initial-scale=1">
 <title>${escapeHtml(String(brand||'GULA'))} · ${escapeHtml(order.number||'Comanda')}</title>
 <style>
  @page{size:${widthMm}mm auto;margin:0}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#fff;color:#000}
  body{width:${widthMm}mm;padding:3mm 2.5mm;font:12px/1.35 Arial,sans-serif}
  .brand{font-size:22px;text-align:center;font-weight:900;letter-spacing:1px}
  .title{text-align:center;font-size:10px;margin:2mm 0 3mm}
  .number{font-size:19px;font-weight:bold;text-align:center;margin:2mm 0}
  .meta{margin:1.5mm 0;font-size:11px;overflow-wrap:anywhere}
  .rule{border-top:1px dashed #000;margin:3mm 0}
  table{border-collapse:collapse;width:100%;table-layout:fixed}
  td{padding:1mm 0;vertical-align:top;overflow-wrap:anywhere}
  .right{text-align:right;width:30%}
  .total{display:flex;justify-content:space-between;gap:3mm;margin:1mm 0}
  .notes{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px}
  .footer{text-align:center;font-size:10px;margin:4mm 0 1mm}
  @media screen{body{margin:auto;border:1px solid #ddd;min-height:100mm}}
 </style></head><body>
 <div class="brand">${escapeHtml(brand)}</div>
 <div class="title">${heading}</div>
 <div class="number">${escapeHtml(order.number||'Sin número')}</div>
 <div class="meta"><b>Cliente:</b> ${escapeHtml(order.customer||'No indicado')}</div>
 <div class="meta"><b>Entrega:</b> ${escapeHtml(order.deliveryDate||'')} ${escapeHtml(order.deliveryWindow||'')}</div>
 <div class="rule"></div>
 <table><tbody>${items}</tbody></table>
 <div class="rule"></div>
 ${rows}
 ${notes?'<div class="meta"><b>Observaciones</b></div><div class="notes">'+escapeHtml(notes)+'</div>':''}
 ${!kitchen?'<div class="footer">Gracias por preferir Gula</div>':''}
 </body></html>`;
}
export function openReceiptPrint(order,opts={}){
 const html=receiptHtml(order,opts);
 const target=window.open('','_blank');
 if(!target)throw Error('Permite ventanas emergentes para imprimir');
 target.document.open();
 target.document.write(html);
 target.document.close();
 target.focus();
 // Impresión mediante navegador/AirPrint. No controlar impresoras sin integración.
 target.addEventListener('load',()=>target.print(),{once:true});
 return target;
}
