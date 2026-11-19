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
