// Verificaciones estáticas básicas de Gula Comandas 2.0.
// No accede a Firebase, no importa datos y no reemplaza las pruebas en navegador.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const rules=readFileSync(new URL('../firebase/firestore.rules',import.meta.url),'utf8');
const fail=(message)=>{throw new Error(message)};
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
assert.ok(scripts.length>0,'index.html debe contener scripts');
for (const [,attrs,raw] of scripts){
 const withoutImports=raw.replace(/^\s*import\s+[^;]+;\s*$/gm,'');
 try {new Function(withoutImports)}catch(e){fail('JavaScript inválido: '+e.message)}
}
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const duplicates=ids.filter((id,i)=>ids.indexOf(id)!==i);
assert.deepEqual(duplicates,[],'Hay IDs duplicados');
for(const id of ['cashKpis','cashDrillPanel','cashView','cashDateType','cashDateExplanation','orderReviewItems','orderCategoryCards','productChoices','stockHistoryProduct','cashClosures']){
 assert.ok(ids.includes(id),'Falta el control requerido: '+id);
}
const chunk=html.slice(html.indexOf('<main>')+6,html.indexOf('</main>'));
assert.ok(chunk.length>0,'No se encontró main');
const voidTags=new Set(['input','img','hr','br','meta','link','source','area']);
const stack=[];
for(const match of chunk.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)){
 const tag=match[1].toLowerCase();
 if(voidTags.has(tag))continue;
 if(match[0].startsWith('</')){
  assert.equal(stack.pop(),tag,'HTML mal cerrado cerca de '+match.index+' ('+tag+')');
 }else stack.push(tag);
}
assert.equal(stack.length,0,'Hay etiquetas HTML sin cerrar');
const sections=[...chunk.matchAll(/<section\s+id="([^"]+)"/g)].map(m=>m[1]);
assert.deepEqual(sections,['new','history','products','clients','cash','reports','admin'],'Deben existir los siete módulos esperados');
assert.match(rules,/allow\s+read\s*,\s*write\s*:\s*if\s+false\s*;/,'No cambiar las reglas bloqueadas en esta etapa');
assert.match(html,/DEMO LOCAL/,'Debe mantenerse la advertencia de demostración');
console.log('Gula 2.0: controles presentes, JavaScript sintácticamente válido, HTML balanceado y Firestore cerrado.');
