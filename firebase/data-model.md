# Gula Comandas 2.0 — Propuesta de modelo de datos en Firestore

**Estado:** diseño técnico, sin despliegue. Las reglas actuales del proyecto de pruebas siguen cerradas. No migrar comandas ni habilitar ventas reales con este documento solamente.

## Separación y titularidad

Los documentos deben pertenecer a un `businessId` estable que represente **Gula**, no al teléfono ni a un UID personal. La pertenencia y los permisos de cada UID requieren validación del servidor o reglas Firestore autorizadas; iniciar sesión en Firebase **no basta** para acceder.

Árbol propuesto (los IDs y rutas son ejemplos de nombres, no datos existentes):

```
businesses/{businessId}
  /members/{uid}                  // activo, roleId y permisos específicos
  /roles/{roleId}                 // definiciones de permisos
  /products/{productId}           // catálogo, categoría, precio, costo, opciones, referencias a imágenes
  /inventory/{productId}          // stock disponible/comprometido + versión
  /inventoryEvents/{eventId}      // delta, motivo, orderId, actorUid, createdAt
  /clients/{clientId}             // ficha cliente; datos personales restringidos
  /orders/{orderId}               // correlativo, cliente, entrega, líneas históricas, total, estado
    /payments/{paymentId}         // monto, método, creado por, fecha servidor
    /refunds/{refundId}           // monto, método, motivo, orden anulada y relación de autorización
  /cashEvents/{eventId}           // ingresos/egresos/retiros y referencia a pagos o devoluciones
  /cashClosures/{dateId}          // cierre por jornada, saldo inicial, valores auditados, autor
  /reportTemplates/{templateId}   // plantillas según visibilidad y permisos
  /audit/{eventId}                // cambios, actor, valores anteriores/referencias
  /settings/general               // preferencias globales (solo personal autorizado)
```

Cada registro de operación tendrá un ID inmutable, `createdAt` definido por el servidor, `updatedAt` cuando corresponda y, para operaciones que puedan repetirse por reintento de red, `idempotencyKey` único por comando. Nunca confiar en precios, totales, permisos, UID declarado ni saldos calculados por el navegador.

## Comandas y pagos

- Las líneas de pedido guardan instantáneas de `productId`, nombre, opción seleccionada, `qty`, `unitPrice` y subtotales para no cambiar ventas históricas al editar el catálogo.
- Los pagos son registros **inmutables** vinculados a la comanda. El saldo por cobrar se deriva de cobros válidos; cancelar una comanda no borra cobros.
- Las devoluciones también se registran por separado, con referencia al cobro original cuando sea posible. Nunca usar un `paystatus` editable como fuente contable.
- El libro de Caja debe derivarse de eventos inmutables; un pago confirmado origina **un solo movimiento** en Caja. Un reintento con la misma clave no vuelve a ingresar dinero.
- El correlativo de comanda se asigna con transacción segura. Una comanda creada sin conexión debe usar ID local provisional hasta que el servidor asigne el número definitivo.

## Inventario y concurrencia

- Reservar stock y crear/editar/anular comanda son operaciones **atómicas** o se rechazan íntegramente.
- Se verifica disponibilidad actual por producto al confirmar; no basta con el stock visto previamente en pantalla.
- La anulación libera stock a lo sumo una vez, en función de la reserva registrada.
- Los ajustes manuales generan eventos inmutables con motivo obligatorio.
- Cada cierre de caja requiere revisión de cuentas pendientes, sello de fecha y autorización. No puede reabrirse por mera edición de un campo de la interfaz.
- Las transacciones Firestore fallan sin conexión. No prometer confirmación definitiva offline. El flujo pendiente de sincronización debe manejar conflictos y permitir revisión humana.

## Reglas y permisos

Matriz prevista: crear pedidos, leer pedidos, editar pedidos, anular, registrar cobros, registrar devoluciones, ajustar inventario, cerrar caja, consultar informes, editar productos/clientes, administrar personal, configurar Gula y restaurar respaldos; todos como permisos independientes.

**Antes de activar Firestore:** implementar identificación de empresa/miembros, comprobar los roles del lado confiable, proteger datos sensibles por tipo, negar campos inesperados, y validar invariante de movimientos en transacciones. Un `match /{document=**}` abierto a usuarios autenticados **no es seguro**.

## Migración y prueba previa

1. Exportar copia manual y comprobar que se puede leer.
2. Auditar datos locales y resolver duplicados/relaciones faltantes.
3. Preparar entorno aislado de pruebas con cuentas y reglas restringidas.
4. Probar dos sesiones simultáneas: stock escaso, pago repetido, doble anulación, devolución mayor al cobro y cierre concurrente.
5. Verificar permisos por acción y acceso negativo (usuario sin rol / de otra empresa).
6. Confirmar operación en iPhone Safari, Chrome Windows y tablet Android, incluida pérdida de conexión.
7. Migrar **solo datos expresamente aprobados** y bajo plan de reversión, sin tocar la versión anterior de Gula.

## Costos y límites

La fase actual permanece en Firebase Spark y GitHub Pages; esta documentación no activa servicios de pago. Cualquier backend adicional, función de servidor o requisito de facturación debe evaluarse expresamente antes de activar.

Fuentes de diseño: [Reglas Firestore](https://firebase.google.com/docs/firestore/security/rules-conditions), [transacciones](https://firebase.google.com/docs/firestore/manage-data/transactions), [permisos/claims](https://firebase.google.com/docs/auth/admin/custom-claims).

## Modelo de permisos — primera implementación en desarrollo

La rama `gula2-desarrollo` incluye `src/access-policy.mjs`, una **política de simulación pura y comprobable**, y `scripts/test-access-policy.mjs` con casos de prueba. No se usa para autorizar operaciones en Firestore ni para impedir mutaciones del demo local. En Administración se puede previsualizar la matriz de tres perfiles sin modificar ningún usuario.

- `principal_admin`: todos los permisos en el modelo; **no se asigna automáticamente** al usuario autenticado.
- `personal`: lectura y creación de comandas, gestión de clientes/productos, ajustes de stock, cobros, movimientos de Caja y consulta de informes, sin permisos de anulación, devoluciones, cierre, restauración, roles ni configuración global por defecto.
- `consulta`: solamente lectura de comandas e informes.
- `grants` y `denies` representan futuras excepciones; las denegaciones tienen prioridad. Los permisos críticos de administración de usuarios, configuración global y restauración no se conceden por simples excepciones a un rol no administrador.
- Sin membresía válida, pertenencia a empresa, coincidencia UID o rol reconocido, **denegar por defecto**.

**Limitación crítica:** cualquier código de permisos en el navegador puede manipularse. Para producción será indispensable comprobar membresía activa, identidad, empresa y capacidades en un lado confiable antes de cada lectura y cambio de datos; utilizar reglas/servidor y pruebas negativas reales. No confiar en el selector de vista, la caché local o la simulación como protección.

## Administración de usuarios — estado de desarrollo

En `Administración → Administrar usuarios (borrador)` se pueden preparar fichas de integrantes (nombre, correo, rol, estado activo/suspendido y permisos individuales). **Son borradores locales por UID y navegador**, nunca cuentas de Firebase, invitaciones enviadas ni autorizaciones reales. Se almacenan en `localStorage` con un namespace independiente de pedidos, fotografías y otros datos. No incluyen contraseñas. Los cambios no se sincronizan ni aparecen a otros usuarios.

### Activación real — flujo pendiente

1. El administrador principal debe quedar **designado desde un entorno de confianza**, verificando la titularidad de la cuenta. **No** bastará seleccionar el rol admin desde la web.
2. El administrador abre **Administración → Usuarios y permisos** y solicita invitar por correo o editar una membresía existente.
3. Un servicio de administración seguro (con Firebase Auth verificado y comprobación de membresía actual/permiso `users.manage`) realiza la operación. Ninguna llamada del cliente puede elegir su `actorUid`, conceder privilegios al propio usuario ni cambiar membresías de otra empresa.
4. Las cuentas se crean/invitan con mecanismos compatibles con Firebase Authentication, **sin manejar contraseñas en el cliente ni almacenarlas en GitHub**. La membresía se asocia al UID real y se deja pendiente hasta la aceptación correspondiente.
5. Antes de asignar/editar/suspender privilegios, el servidor valida que queda al menos un administrador principal activo, registra la auditoría con fecha de servidor y aplica cambios de forma atómica cuando corresponda.
6. Las operaciones de pedidos, pagos, clientes, inventario y Caja se autorizan también del lado confiable, por capacidad individual, sin depender de ocultar botones. Las reglas de lectura de prueba `firestore.readonly-preview.rules` aún utilizan únicamente roles y no reflejan excepciones individuales, por lo que **no deben publicarse como reglas definitivas**.
7. La suspensión debe impedir nuevas operaciones en el servidor incluso si un cliente conserva una sesión iniciada; se comprobará la revocación y caducidad de credenciales con pruebas de seguridad.

Las fichas locales no migran automáticamente a producción, no pueden verificar un correo existente de Firebase y **no constituyen autorización para acceder a ventas reales**.
