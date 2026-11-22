// Respaldo descargable de colecciones compartidas; no es restauración ni backup programado.
import {getFirestore,collection,getDocs} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const types=['members','products','clients','orders','inventory','cashEntries','cashClosures','audit'];
function clean(value){
 if(value===null||typeof value!=='object')return value;
 if(typeof value.toDate==='function' && typeof value.seconds==='number')return value.toDate().toISOString();
 if(Array.isArray(value))return value.map(clean);
 return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v)]));
}
export async function sharedBackup(firebaseApp,{uid,principal,businessId='gula'}={}){
 if(!uid||!principal||businessId!=='gula')throw Error('El respaldo requiere una sesión de administración principal');
 const db=getFirestore(firebaseApp),data={};
 for(const group of types){
  const snapshot=await getDocs(collection(db,'businesses',businessId,group));
  data[group]=snapshot.docs.map(d=>({id:d.id,...clean(d.data())}));
 }
 return {format:'gula-firestore-export',version:1,businessId,exportedAt:new Date().toISOString(),exportedBy:uid,
  note:'Copia de consulta de Firestore, sin contraseñas de Firebase Authentication. No sustituye respaldos automáticos ni permite restauración directa.',
  data};
}
export async function downloadSharedBackup(firebaseApp,session){
 const backup=await sharedBackup(firebaseApp,session);
 const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 a.href=url;a.download='gula-firestore-respaldo-'+stamp+'.json';
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),5000);
 return {counts:Object.fromEntries(Object.entries(backup.data).map(([k,v])=>[k,v.length])),exportedAt:backup.exportedAt};
}
