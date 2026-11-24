/**
 * Gula 2.0 — modelo PURO de permisos para pruebas, NO autorización de producción.
 * Un navegador no puede convertirse en autoridad para decidir el acceso.
 * Al desplegar datos reales, estas condiciones deben validarse en un backend
 * confiable y en reglas de Firestore apropiadas.
 */
export const PERMISSIONS=Object.freeze([
 ['orders.read','Consultar comandas'],
 ['orders.create','Crear comandas'],
 ['orders.edit','Editar comandas'],
 ['orders.close','Cerrar comandas'],
 ['orders.reopen','Reabrir comandas'],
 ['orders.cancel','Anular comandas'],
 ['payments.record','Registrar pagos'],
 ['refunds.record','Registrar devoluciones'],
 ['products.manage','Administrar productos'],
 ['inventory.adjust','Ajustar existencias'],
 ['clients.manage','Administrar clientes'],
 ['cash.manage','Registrar movimientos de Caja'],
 ['cash.close','Cerrar Caja'],
 ['reports.read','Consultar informes'],
 ['users.manage','Administrar usuarios y permisos'],
 ['settings.manage','Configuración global'],
 ['backups.restore','Restaurar respaldos']
]);
const ALL=PERMISSIONS.map(([id])=>id);
export const ROLE_DEFAULTS=Object.freeze({
 principal_admin:Object.freeze([...ALL]),
 personal:Object.freeze(['orders.read','orders.create','orders.edit','orders.close','clients.manage','inventory.adjust','payments.record','cash.manage','reports.read']),
 consulta:Object.freeze(['orders.read','reports.read'])
});
const RESERVED=new Set(['users.manage','settings.manage','backups.restore']);
export function canPerform({authUid,businessId,membership,permission}={}){
 if(!authUid||!businessId||!membership||membership.active!==true)return false;
 if(membership.uid!==authUid||membership.businessId!==businessId)return false;
 if(!ALL.includes(permission))return false;
 const defaults=ROLE_DEFAULTS[membership.roleId];
 if(!defaults)return false;
 if(Array.isArray(membership.denies)&&membership.denies.includes(permission))return false;
 // Nunca elevar privilegios críticos con excepciones locales.
 if(RESERVED.has(permission))return membership.roleId==='principal_admin';
 return defaults.includes(permission)||(Array.isArray(membership.grants)&&membership.grants.includes(permission));
}
export function simulateRole(roleId){
 const uid='simulado',businessId='gula-simulacion';
 return PERMISSIONS.map(([key,label])=>({key,label,allowed:canPerform({authUid:uid,businessId,membership:{uid,businessId,active:true,roleId},permission:key})}));
}
