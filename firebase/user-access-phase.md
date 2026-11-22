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

## Integración de interfaz preparada
En la rama aislada se conectó `index.html` con `membershipApi`: tras iniciar sesión, la UI espera una membresía activa en `businesses/gula/members/{uid}`. Usuarios sin membresía, suspendidos o con error de lectura ven un bloqueo; la información comercial de la demo local no se carga. El administrador principal puede consultar miembros y vincular un UID de Authentication preexistente, editar, suspender y reactivar mediante edición.

**Importante**: esta rama no está publicada ni probada en el navegador. Sin Firestore configurado y sin membresía inicial del administrador, cualquier cuenta autenticada quedará en la pantalla de acceso pendiente. El archivo de reglas tampoco se ha desplegado. El borrador local de usuarios quedó oculto, no eliminado.

**No es producción**: aunque la entrada a la pantalla se valida, los permisos granulares aún NO se aplican a las operaciones comerciales (que todavía son locales). Se debe implementar autorización por cada módulo, pruebas reales de seguridad, auditoría inmutable y protección de datos antes de uso comercial. La suspensión no elimina la sesión de Authentication, solo revoca la autorización sobre documentos protegidos y la UI integrada.

## Preparación y pruebas manuales (no ejecutadas)
1. Confirmar que el proyecto correcto es `gula-comandas-2-0-pruebas` en Firebase Console y que Firestore está habilitado.
2. Abrir Authentication → Usuarios y copiar el UID del propietario. No compartir contraseñas ni claves privadas.
3. En Firestore, crear documento `businesses/gula/members/{UID_PROPIETARIO}` con exactamente: `uid` (UID), `businessId` ("gula"), `name` (nombre), `email` (correo), `roleId` ("principal_admin"), `active` (boolean true), `grants` (array vacío), `denies` (array vacío), `updatedBy` (UID), `updatedAt` (timestamp). Para el alta inicial administrativa desde consola, verificar que los campos correspondan al documento y las reglas.
4. Probar las reglas en el emulador con Firebase Auth: miembro sin rol no puede listar ni editar; personal no puede elevar su rol; admin principal no puede suspenderse; admin puede suspender otro miembro; suspendido no puede leer datos de membresías ajenas.
5. Revisar la rama en un entorno de prueba aislado sin mezclar la URL principal con la publicada en GitHub Pages; no desplegar sobre `main`.
6. Probar: cuenta sin membresía → bloqueo; propietario autorizado → listado; cuenta personal activa → acceso de demo; suspender desde la cuenta propietaria → la otra pantalla debe bloquearse; reactivar → acceso de nuevo.
7. Solo cuando estas pruebas estén aprobadas, evaluar reglas desplegadas y auditoría persistente. No usar datos de clientes reales ni ventas reales.
