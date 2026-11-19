// Gestión LOCAL de fichas de usuarios de prueba. No modifica Firebase Auth ni permisos reales.
// Nunca usar estas fichas como identidad o autoridad de acceso.
import {PERMISSIONS,ROLE_DEFAULTS} from './access-policy.mjs';
export const DEMO_ROLES=Object.freeze([
 ['principal_admin','Administración principal'],
 ['personal','Personal'],
 ['consulta','Solo consulta']
]);
const permissionIds=new Set(PERMISSIONS.map(([key])=>key));
const restricted=new Set(['users.manage','settings.manage','backups.restore']);
export function normalizeDemoMember(input){
 const name=String(input?.name||'').trim().replace(/\s+/g,' ').slice(0,80);
 const email=String(input?.email||'').trim().toLowerCase().slice(0,160);
 const roleId=String(input?.roleId||'');
 if(name.length<2)throw Error('Escribe un nombre de al menos 2 caracteres.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Ingresa un correo válido.');
 if(!DEMO_ROLES.some(([id])=>id===roleId))throw Error('Selecciona un perfil válido.');
 const grants=[...new Set(Array.isArray(input?.grants)?input.grants:[])].filter(k=>permissionIds.has(k)&&!restricted.has(k));
 const denies=[...new Set(Array.isArray(input?.denies)?input.denies:[])].filter(k=>permissionIds.has(k));
 const grantSet=new Set(grants);
 return {id:typeof input?.id==='string'&&/^demo-[a-zA-Z0-9-]{8,80}$/.test(input.id)?input.id:null,name,email,roleId,active:input?.active!==false,grants,denies:denies.filter(x=>!grantSet.has(x))};
}
export function effectiveDemoPermissions(member){
 const result=normalizeDemoMember(member);
 if(!result.active)return [];
 const base=new Set(ROLE_DEFAULTS[result.roleId]||[]);
 for(const key of result.grants)base.add(key);
 for(const key of result.denies)base.delete(key);
 if(result.roleId!=='principal_admin')for(const key of restricted)base.delete(key);
 return [...base];
}
export function validateDemoRoster(rows){
 if(!Array.isArray(rows)||rows.length>50)throw Error('Máximo 50 fichas de prueba.');
 const result=[],seen=new Set();
 for(const raw of rows){
  const item=normalizeDemoMember(raw);
  if(!item.id)throw Error('La ficha no tiene un identificador válido.');
  if(seen.has(item.email))throw Error('Hay correos repetidos.');
  seen.add(item.email);result.push(item);
 }
 return result;
}
