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
test('no se importa ni se fusiona almacenamiento local como ventas compartidas',()=>{
 assert.doesNotMatch(workspace,/localStorage/);
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
