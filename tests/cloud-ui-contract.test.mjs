import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const workspace=readFileSync(new URL('../src/cloud-workspace.mjs',import.meta.url),'utf8');
test('la interfaz Gula carga el módulo compartido dentro de la app',()=>{
 assert.match(html,/import \{attachCloudWorkspace\}/);
 assert.match(html,/<section id="cloud"/);
 assert.match(html,/cloudWorkspace\.start\(\)/);
 assert.match(html,/cloudWorkspace\.stop\(\)/);
});
test('todos los identificadores de la interfaz cloud existen en la sección montada',()=>{
 const cloud=html.slice(html.indexOf('<div id="cloudWorkspace">'),html.indexOf('</section>',html.indexOf('<div id="cloudWorkspace">')));
 const ids=[...workspace.matchAll(/(?:el|v)\(root,'([^']+)'\)/g)].map(m=>m[1]);
 for(const id of new Set(ids))assert.ok(cloud.includes('data-cloud="'+id+'"'),'Falta campo '+id);
});
test('la app guarda solo identificadores pendientes localmente, nunca ventas demo como ventas compartidas',()=>{
 assert.match(workspace,/gula2_pending_ops_v1_/);
 assert.match(workspace,/sales\.checkOperation/);
 assert.doesNotMatch(workspace,/gula2_demo_v1_/);
 assert.doesNotMatch(workspace,/DEMO-/);
 assert.match(workspace,/sales\.createOrder/);
 assert.match(workspace,/sales\.recordPayment/);
});
test('el carrito admite más de una línea por comanda',()=>{
 assert.match(workspace,/cart\.map\(x=>\(\{\.\.\.x\}\)\)/);
 assert.match(html,/data-cloud-action="addLine"/);
 assert.match(html,/data-cloud="cart"/);
});

test('productos compartidos pueden editar variantes con recargos',()=>{
 assert.match(html,/data-cloud="productOptions"/);
 assert.match(workspace,/parseProductOptions\(v\(root,'productOptions'\)\)/);
 assert.match(workspace,/p\.options\|\|\[\]/);
});
test('creación de productos y clientes reutiliza clave de guardado',()=>{
 assert.match(workspace,/master\.addProduct\(getUser\(\),data,key\)/);
 assert.match(workspace,/master\.addClient\(getUser\(\),data,key\)/);
});

test('el estado visual advierte las operaciones sin confirmar y evita cambiar importes al reintentar',()=>{
 assert.match(html,/data-cloud="pendingNotice"/);
 assert.match(workspace,/existing\.payload!==stable/);
 assert.match(workspace,/loadPending\(\)/);
 assert.match(workspace,/savePending\(\)/);
});

test('puede consultar pagos pendientes sin enviar un nuevo cargo',()=>{
 assert.match(html,/data-cloud-action="checkPending"/);
 assert.match(workspace,/async function checkAllPending/);
 assert.match(workspace,/sales\.checkOperation\(cloudKinds\[kind\],row\.key\)/);
 assert.match(workspace,/pending\.delete\(kind\)/);
});

test('los informes históricos requieren fechas y paginación, sin presentar 200 filas como total',()=>{
 assert.match(workspace,/loadSharedReportPeriod/);
 assert.match(workspace,/Vista rápida de solo las 200 comandas/);
 assert.match(workspace,/Selecciona las fechas desde y hasta/);
 assert.match(workspace,/dataset\.partialOrders\|\|dataset\.partialCash/);
});

test('informes CSV solo pueden exportarse después de consultar un período completo',()=>{
 assert.match(html,/data-cloud-action="exportReport"/);
 assert.match(workspace,/lastCompleteReport/);
 assert.match(workspace,/downloadReportCsv/);
 assert.match(workspace,/dataset\.partialOrders/);
});

test('no permite exportar un informe si han cambiado sus filtros o llegaron datos nuevos',()=>{
 assert.match(workspace,/lastReportFilters!==JSON\.stringify\(reportFilters\(\)\)/);
 assert.match(workspace,/invalidateReport\(\{data:true\}\)/);
 assert.match(workspace,/if\(e\.target\.matches\('\[data-cloud\^="report"\]'\)\)/);
 assert.match(workspace,/reportEpoch\+\+/);
});

test('historial compartido muestra estado pagado, parcial y pendiente junto al saldo',()=>{
 assert.match(workspace,/cloud-payment-state cloud-payment-/);
 assert.match(workspace,/cloud-order-card cloud-order-/);
 assert.match(workspace,/Saldo '\+clp\(o\.balance\)/);
 assert.match(html,/\.cloud-payment-pending\{/);
 assert.match(html,/\.cloud-payment-partial\{/);
 assert.match(html,/\.cloud-payment-paid\{/);
});

test('Nueva Comanda ofrece categorías, fotografías y listado alternativo',()=>{
 assert.match(html,/data-cloud="productCards"/);
 assert.match(html,/data-cloud="categoryFilters"/);
 assert.match(html,/data-cloud="product"/);
 assert.match(workspace,/function drawProductCards/);
 assert.match(workspace,/data-cloud-pick-product/);
 assert.match(workspace,/aria-pressed/);
});
test('autocompletado de clientes necesita al menos cuatro letras y no bloquea clientes nuevos',()=>{
 assert.match(html,/list="gulaCloudCustomerSuggestions"/);
 assert.match(workspace,/function drawCustomerSuggestions/);
 assert.match(workspace,/search\.length<4/);
 assert.match(workspace,/slice\(0,8\)/);
});
test('previsualización de stock es indicativa y toma fecha de entrega',()=>{
 assert.match(html,/data-cloud="stockHint"/);
 assert.match(workspace,/function stockSummary/);
 assert.match(workspace,/stockMode|mode==='dated'/);
 assert.match(workspace,/La disponibilidad se confirma al guardar/);
});

test('Nueva Comanda solicita confirmar resumen antes de registrar o editar una venta',()=>{
 assert.match(workspace,/function confirmOrderSummary/);
 assert.match(workspace,/window\.confirm/);
 assert.match(workspace,/if\(!confirmOrderSummary\(data\)\)return/);
 assert.match(workspace,/if\(!confirmOrderSummary\(payload,\{edit:true\}\)\)return/);
});
test('fecha del historial compartido se muestra en formato DD-MM-AAAA',()=>{
 assert.match(workspace,/const dayCL=value=>/);
 assert.match(workspace,/safe\(dayCL\(o\.deliveryDate\)\)/);
});

test('Nueva Comanda utiliza hora única opcional y permite alta rápida de clientes',()=>{
 assert.match(html,/data-cloud="window" type="time"/);
 assert.match(html,/data-cloud-action="quickClient"/);
 assert.match(workspace,/if\(action==='quickClient'\)/);
 assert.match(workspace,/permission\('clients.manage'\)/);
 assert.match(workspace,/master\.addClient\(getUser\(\),data,key\)/);
});

test('el cierre de caja presenta un resumen legible y pendientes, no JSON técnico',()=>{
 assert.match(html,/data-cloud="closePreview"/);
 assert.match(workspace,/function showCashPreview/);
 assert.match(workspace,/Comandas pendientes de pago/);
 assert.match(workspace,/Efectivo esperado/);
 assert.match(workspace,/TEF neto/);
 assert.doesNotMatch(workspace,/closePreview'\)\.textContent=JSON\.stringify/);
 assert.match(workspace,/el\(root,'pendingReviewed'\)\.checked=false/);
});

test('el cierre de caja exige revisión reciente si cambian fecha o importes',()=>{
 assert.match(workspace,/function cashReviewSignature/);
 assert.match(workspace,/cashPreviewSignature!==cashReviewSignature\(\)/);
 assert.match(workspace,/Revisa la caja con los valores actuales/);
 assert.match(workspace,/Los datos han cambiado\. Pulsa Revisar caja/);
 assert.match(workspace,/Efectivo contado/);
 assert.match(workspace,/Diferencia/);
});

test('se imprime solo una comanda de 58 mm desde Historial, sin impresión automática de cocina',()=>{
 assert.match(html,/data-print-order/);
 assert.match(html,/import \{demoOrderForReceipt\} from '\.\/src\/receipt-print-adapter\.mjs'/);
 assert.match(html,/openReceiptPrint\(demoOrderForReceipt\(order\),\{widthMm:58,type:'customer'\}\)/);
 assert.match(workspace,/data-cloud-print/);
 assert.doesNotMatch(workspace,/data-cloud-kitchen/);
});
