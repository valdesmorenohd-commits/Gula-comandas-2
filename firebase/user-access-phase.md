# Gestión de usuarios Firebase — fase aislada (NO DESPLEGADA)

Rama: `gula2-usuarios-firebase`. Esta fase no modifica el sitio publicado ni el sistema antiguo de Gula. No activar ventas reales.

## Alcance preparado
- `firebase/firestore.rules`: solo habilita consultar membresía propia y administrar fichas de personal desde una membresía de administrador principal activa. **Toda otra información comercial sigue bloqueada**.
- `src/firebase-members.mjs`: escucha cambios de membresía en tiempo real; ofrece listado, alta de *membresía para UID Auth existente*, cambio de perfil y suspensión. No se importa aún desde `index.html`.
- Una suspensión impide acceso a datos protegidos por estas reglas y puede cerrar/bloquear la interfaz cuando se integre `watchAccess`. **No deshabilita por sí misma Firebase Authentication**. Para deshabilitar la cuenta de Auth hace falta Admin SDK en servidor o la consola de Firebase.

## Pasos de activación pendientes
1. Verificar en Firebase Console que Firestore está creado y la cuenta administradora ya existe en Authentication.
2. Definir un `businessId` estable para Gula. Crear la primera membresía principal mediante **Firebase Console o un entorno privilegiado** (nunca desde la web), en `businesses/{businessId}/members/{uid}` con los campos `uid`, `businessId`, `name`, `email`, `roleId: principal_admin`, `active: true`, `grants: []`, `denies: []`.
3. Probar las reglas en emulador: sin autenticación, sin membresía, empleado activo, suspendido, admin activo; impedir a empleado elevar privilegios y a admin modificar su propio rol.
4. Revisar el modelo de auditoría de cambios y permisos. Las modificaciones de membresía aún **no crean eventos de auditoría inmutables**, por lo tanto no se habilitan para operación real.
5. Integrar `watchAccess` en el inicio de sesión y bloquear **toda** la UI y los datos locales si no hay membresía activa, antes de mostrar Administración.
6. Crear interfaz de administración con confirmación explícita antes de suspender, y comprobar en dos navegadores que los permisos se revocan. Una cuenta de Auth debe crearse aparte y vincularse por UID.
7. Revisar y desplegar reglas **solo después de aprobar las pruebas**. Hasta entonces se conserva el comportamiento actual.

## Restricciones de seguridad
No exponer service accounts, claves privadas o Admin SDK en GitHub Pages. No confiar en permisos definidos en localStorage. No usar `allow read, write: if request.auth != null`. No se migra historial ni se toca la versión anterior.
