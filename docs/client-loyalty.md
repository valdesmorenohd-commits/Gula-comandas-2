# Fidelización de clientes: cumpleaños y análisis de compras

**Estado:** desarrollado parcialmente en la rama `gula2-desarrollo` como demostración local. No hay envío de correos, tareas programadas ni sincronización de clientes. No se modifica la aplicación pública actual.

## Ficha de cliente

- Se incorpora fecha de nacimiento opcional. Para recordar cumpleaños se usa el día y mes; el año se conserva en esta demo porque el campo del navegador lo solicita, pero un diseño de producción debería permitir registrar solo día y mes para minimizar datos.
- Se agrega autorización explícita para recibir un **saludo por correo el día del cumpleaños**. Por defecto está desmarcada, y se puede retirar editando la ficha. Marcarla en la app no prueba por sí solo que el cliente dio su consentimiento, por lo que la versión de producción deberá registrar cuándo, cómo y con qué información se obtuvo ese permiso.
- Un aviso en Clientes muestra cumpleaños que se aproximan en 14 días, incluso sin consentimiento de correo (solo para gestión interna). El 29 de febrero se recuerda el 28 en años no bisiestos, decisión revisable.
- La vista del cliente indica fecha y estado de autorización. No se envían mensajes al guardar la ficha.

## Informe de compras por cliente

- Las cifras se calculan **solo** sobre comandas con `clientId` idéntico al ID de la ficha.
- Se excluyen comandas anuladas. Se muestra total de compras activas, unidades, promedio por comanda, última fecha de compra, intervalo medio entre compras y desglose de productos con cantidad, número de comandas y monto histórico de la línea.
- Los productos se agrupan por ID/opción; si la venta antigua no tiene ID se usa el nombre. Las ventas anteriores sin `clientId` no se asocian automáticamente por coincidencia de nombres.
- Los importes de productos se calculan con **precios históricos de líneas**, no el precio vigente del catálogo. No restan devoluciones de dinero a menos que la venta se haya anulado: este informe describe **comportamiento de pedidos**, no conciliación contable.
- Los datos se recalculan de los pedidos locales disponibles en el navegador/usuario; no consolidan otros dispositivos.

## Envío automático: diseño pendiente

**No está activado**. Para que el correo se envíe aunque el iPhone esté apagado, hará falta un proceso programado en un backend con acceso autorizado y servicio de correo (por ejemplo, Google Apps Script con cuenta corporativa o un proveedor transaccional, sujeto a cuotas, políticas y costos que habrá que revisar antes de adoptar).

Flujo requerido antes del primer envío:

1. El cliente registra una dirección válida, su cumpleaños y **consentimiento específico y revocable** para felicitaciones por correo. Conservar fecha, origen y versión del consentimiento; ofrecer una manera clara de darse de baja.
2. Un proceso diario, configurado para **America/Santiago**, consulta solo clientes habilitados y sus consentimientos actuales; no depende de que la app esté abierta.
3. Antes del envío, volver a comprobar permiso, correo, fecha, estado de la ficha y que no se haya enviado ya ese año. Usar una clave de idempotencia como `businessId/clientId/año/tipo`, con reserva atómica de intento para impedir dobles envíos por reintentos.
4. Plantilla personalizable con saludo cordial de Gula y opción de desuscripción. No revelar historial de compras ni datos personales del cliente en el mensaje.
5. Registrar estado de cada envío (pendiente/enviado/error/reintento/cancelado), fecha y proveedor, con acceso restringido. Si el cliente retira consentimiento, suprimir envíos futuros.
6. Probar usando correos de prueba y un entorno independiente. Revisar obligaciones de protección de datos y comunicaciones comerciales aplicables en Chile antes de activar.

Nunca subir direcciones de clientes reales o tokens de correo a GitHub. No ejecutar envíos desde JavaScript del navegador, ni guardar contraseñas de correo en la app.

## Próximas comprobaciones

- Validar en Safari el diseño móvil, fecha y consentimiento; verificar guardar/editar/restaurar desde JSON local.
- Pruebas con pedidos anulados, productos renombrados, opciones, compras entre años, cumpleaños 29 de febrero y personas que comparten nombre.
- Completar sincronización, autorización servidor y preferencias de privacidad antes de uso real.
