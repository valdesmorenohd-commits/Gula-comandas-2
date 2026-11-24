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
