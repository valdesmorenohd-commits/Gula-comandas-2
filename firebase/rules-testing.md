# Pruebas automáticas de permisos de Gula (local)

## Por qué las pruebas manuales de Firebase Console no eran suficientes
El simulador de `update` recibió únicamente `{active:false}`. La regla exige un documento final completo y `updatedAt == request.time`, que se satisface al usar `serverTimestamp()` **en una operación real**; el simulador manual no reproduce esa operación con facilidad. Un resultado rojo por sí solo no demuestra que la suspensión funcione.

## Pruebas preparadas (NO ejecutadas ni desplegadas)
1. Instalar Node.js 20+, Java 17 o superior y Firebase CLI.
2. En un clon local de **esta rama**, ejecutar `npm install` y `npm run test:rules`.
3. Se levanta el emulador Firestore local con el proyecto ficticio `gula-members-test` y datos ficticios. **No conecta ni modifica Firebase real**.
4. Comprobar que pasan los casos de lectura propia, listado de administrador, bloqueo de personal, modificación propia prohibida, suspensión y reactivación por administrador, y bloqueo de comandas.
5. Si falla alguna prueba, corregir reglas o cliente y ejecutar nuevamente antes de cualquier publicación.

## Estado de Firebase real
El usuario ya creó en Firestore las membresías del administrador principal y Felipe, y comprobó lecturas con el simulador. Las nuevas reglas estuvieron en la consola como **cambios sin publicar**. Los cambios de esta rama no despliegan nada.

## Próximas decisiones antes de publicar
- Ejecutar las pruebas anteriores de verdad, incluida la suspensión y reactivación.
- Probar la interfaz de la rama sin ponerla en el sitio principal.
- No afirmar que la creación de cuentas Authentication está incluida: esta fase solo vincula UID existentes.
- Revisar auditoría inmutable y la imposibilidad de confiar en contenido local para operaciones comerciales.
- Mantener **main** y el sistema antiguo sin modificaciones.
