// Fase usuarios Firebase: acceso y administración de membresías.
import {getFirestore,doc,getDoc,onSnapshot,collection,query,getDocs,setDoc,updateDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {PERMISSIONS,canPerform} from './access-policy.mjs';
const allowedRoles=new Set(['personal','consulta']);
const allowedPermissions=new Set(PERMISSIONS.map(([id])=>id));
const reserved=new Set(['users.manage','settings.manage','backups.restore']);
export function membershipApi(firebaseApp,businessId) {
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(businessId)) throw Error('Identificador de Gula no válido');
  const db=getFirestore(firebaseApp);
  const members=collection(db,'businesses',businessId,'members');
  const ref=uid=>doc(db,'businesses',businessId,'members',uid);
  function sanitizeStaff(data) {
    const name=String(data.name||'').trim().slice(0,80);
    const email=String(data.email||'').trim().toLowerCase().slice(0,160);
    if(name.length<2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Nombre o correo inválido');
    if(!allowedRoles.has(data.roleId)) throw Error('Rol no autorizado');
    const filter=(items)=>[...new Set(Array.isArray(items)?items:[])].filter(p=>allowedPermissions.has(p)&&!reserved.has(p));
    const grants=filter(data.grants), denies=filter(data.denies).filter(p=>!grants.includes(p));
    return {name,email,roleId:data.roleId,active:data.active===true,grants,denies};
  }
  function assertPrincipal(actor) {
    if(!actor?.uid || !canPerform({authUid:actor.uid,businessId,membership:actor.membership,permission:'users.manage'}))
      throw Error('Acceso denegado: se requiere administración principal activa');
  }
  return {
    // La UI debe ocultar el contenido de Gula mientras el estado sea
    // loading, inactive, missing o error. Nunca usar un rol de localStorage.
    watchAccess(user,handler) {
      if(!user){handler({status:'signed-out'});return ()=>{};}
      handler({status:'loading'});
      return onSnapshot(ref(user.uid),snap=>{
        if(!snap.exists()) return handler({status:'missing'});
        const membership=snap.data();
        if(membership.uid!==user.uid || membership.businessId!==businessId || membership.active!==true)
          return handler({status:'inactive'});
        handler({status:'active',membership});
      },error=>handler({status:'error',message:error.code||'Error al verificar acceso'}));
    },
    async list(actor) {
      assertPrincipal(actor);
      const snapshot=await getDocs(query(members));
      return snapshot.docs.map(d=>({uid:d.id,...d.data()}));
    },
    async addExistingAuthUser(actor,uid,data) {
      assertPrincipal(actor);
      if(!/^[a-zA-Z0-9_-]{8,128}$/.test(uid) || uid===actor.uid)
        throw Error('UID no válido');
      const clean=sanitizeStaff(data);
      const existing=await getDoc(ref(uid));
      if(existing.exists()) throw Error('La membresía ya existe');
      // La identidad Firebase Authentication debe existir previamente.
      // Firestore no verifica que exista una cuenta Auth para este UID.
      await setDoc(ref(uid),{uid,businessId,...clean,updatedAt:serverTimestamp(),updatedBy:actor.uid});
    },
    async changeStaff(actor,uid,data) {
      assertPrincipal(actor);
      if(uid===actor.uid)throw Error('No puedes modificar tu propia cuenta');
      const clean=sanitizeStaff(data);
      await updateDoc(ref(uid),{...clean,updatedAt:serverTimestamp(),updatedBy:actor.uid});
    },
    async suspend(actor,uid) {
      assertPrincipal(actor);
      if(uid===actor.uid)throw Error('No puedes suspenderte a ti mismo');
      await updateDoc(ref(uid),{active:false,updatedAt:serverTimestamp(),updatedBy:actor.uid});
    },
    async reactivate(actor,uid) {
      assertPrincipal(actor);
      if(uid===actor.uid)throw Error('No puedes modificar tu propia cuenta');
      await updateDoc(ref(uid),{active:true,updatedAt:serverTimestamp(),updatedBy:actor.uid});
    }
  };
}
