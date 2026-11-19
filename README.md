# Gula Comandas 2.0 — Entorno de pruebas

**Sitio:** https://valdesmorenohd-commits.github.io/Gula-comandas-2/

**Estado:** Demostración de interfaz. **No utilizar para ventas reales.** Este repositorio es independiente del sistema anterior.

## Implementado en el sitio
- Inicio y cierre de sesión reales con Firebase Authentication del proyecto `gula-comandas-2-0-pruebas`.
- Página inicial Nueva comanda; módulos Historial, Productos, Clientes, Inventario, Caja, Informes y Administración.
- Crear comandas **DEMO** con productos y totales en CLP, fecha y franja horaria de entrega, pago pendiente/pagado.
- Persistencia **local en este navegador y este usuario**, no en Firebase. Los ejemplos no se sincronizan ni se deben considerar ventas.
- Inicio sin historial y sin clientes previos. Dos productos ficticios ilustrativos.
- Borrar datos locales desde Administración.

## No implementado aún
- Operaciones reales con Firestore, permisos personalizados, escritura y auditoría seguras.
- Stock reservado por fecha, pagos múltiples, retiros, cierres de caja, informes completos, trabajo sin conexión reconciliado.
- Impresión directa y cola de impresora cocina.
- Respaldos y recuperación de **nuevos datos reales**, si se configura producción; no se migra ni respalda historial anterior.

## Seguridad
Firestore mantiene reglas restrictivas por defecto. No cambiar a reglas públicas para acelerar las pruebas. La configuración web de Firebase no es una clave privada. No guardar contraseñas en el repositorio.

## Herramientas
Hosting: GitHub Pages gratuito. Firebase Authentication y Firestore: Spark, sin activación de Blaze. No se envían comandas a Firebase.

## Próxima fase
Desarrollar y revisar operaciones persistentes con roles y permisos antes de permitir comandos de ventas reales. Validar con pruebas funcionales en iPhone, Windows y tablet Android.


## Informes — actualización noviembre 2026
- Filtros combinables en la demo: período hoy/semana/mes/rango, fecha de creación o entrega, cliente/número, producto, estado de pago, medio y rango de montos.
- Resumen recalculado por filtros y detalle al seleccionar un indicador.
- Agrupación por día, cliente, producto, estado y medio. Al agrupar por producto, los montos corresponden a líneas de producto.
- Orden por fecha, monto o nombre, descarga CSV compatible con Excel, impresión/guardar PDF mediante diálogo del navegador.
- Plantillas de informes guardadas **solo en el navegador y usuario actual** (no compartidas ni sincronizadas).
- Falta: fecha individual de pago, abonos, devoluciones, transacciones de caja, informes configurables por columnas con gráficos, KPI reordenables, permisos para plantillas compartidas, exportación XLSX nativa, backend Firebase.
- Todos los datos siguen siendo de demostración: no utilizar para operaciones reales.

## Caja: movimientos y cierres (demo local)
- Se pueden registrar cobros y abonos de comandas, egresos por compras, ingresos independientes y retiros de efectivo o TEF.
- Cada movimiento independiente exige un monto entero positivo y motivo, almacena fecha/hora, categoría y método.
- Libro de movimientos con filtro de fechas y separación entre entradas y salidas.
- Resumen de efectivo y TEF: el efectivo estimado es la suma histórica de entradas menos salidas; **no sustituye el conteo físico ni el saldo inicial**.
- Cierre por fecha con confirmación, resumen neto del día, pendientes vinculados a la fecha de entrega y conteo manual opcional; puede indicar un saldo inicial para comparar el efectivo esperado.
- Los cierres son **fotos locales de prueba**, sin reapertura, trazabilidad multiusuario ni concurrencia transaccional. Los cambios posteriores de pedidos preexistentes pueden afectar registros históricos; **no usar para caja real**.
- El informe incorpora las entradas y salidas de caja por fecha de cada movimiento; se diferencia del filtro por fecha de creación o entrega de comandas.
- Importante: todavía falta definir y probar saldo de apertura/cierre persistido entre jornadas, arqueos reales, autorizaciones, manejo de anulaciones/devoluciones, cierres seguros y reconciliación al sincronizar con Firebase.

## Anulación y devoluciones — demo local
- Historial permite anular una comanda (motivo obligatorio, confirmación), sin borrarla ni permitir editarla después.
- Si la comanda tenía reserva de stock registrada, esta se libera una vez, con movimiento histórico; los pedidos más antiguos que no reservaron stock no generan devolución artificial.
- La anulación **no genera automáticamente una devolución de dinero**. Si la comanda cobró algo, Caja presenta «Por devolver» y un formulario de devolución manual.
- Cada devolución registra monto, medio, fecha/hora y motivo; genera un egreso separado en el libro de movimientos. Se prohíben devoluciones que superen lo cobrado pendiente de devolver.
- Las comandas anuladas no se cuentan como ventas activas ni como cuentas por cobrar; sí permanecen en Historial, filtros e informes.
- Todo es local a navegador y usuario. No hay permisos de administrador implementados, reconciliación de pagos con banco ni control transaccional multiusuario. **No usar para reembolsos, ventas, devoluciones ni cierres reales**.

## Clientes — fichas individuales (demo local)
- Lista con búsqueda por nombre, teléfono o correo, orden alfabético, mayor número de comandas o actividad reciente.
- Crear/editar nombre, teléfono, correo, dirección de entrega y observaciones.
- Selección de cliente existente tras cuatro caracteres: las sugerencias identifican cada ficha de manera independiente, incluso si hay nombres repetidos.
- Nuevas comandas guardan `clientId` además del nombre de cliente capturado en el pedido; cambiar el nombre en la ficha **no reescribe** comandas antiguas.
- Al escribir un nombre sin seleccionar una ficha existente, se crea una ficha nueva. No se fusionan automáticamente clientes con nombres iguales.
- Ficha muestra historial, ventas activas, saldos pendientes y estados de las comandas vinculadas por identificador.
- Las comandas creadas antes de esta actualización no contienen `clientId`: por seguridad **no se vinculan retrospectivamente por coincidencia de nombres**. Para asociarlas, el usuario puede editar la comanda y seleccionar explícitamente la ficha existente.
- Todo sigue siendo local y de demostración; falta sincronización Firebase, validación de roles y pruebas en distintos dispositivos.

## Productos: catálogo ampliado — demo local
- Categoría por producto, búsqueda y filtro por categoría.
- Selector de vista listado/fotografías para Nueva comanda; fotos cuadradas procesadas localmente en el navegador, sin subir archivos.
- Ficha de edición incluye nombre, precio, categoría, costo unitario opcional, fotografía y opciones de producto con recargo.
- Opciones editables en formato `Nombre|recargo` (una por línea). En esta primera demo se admite **una opción por producto y línea**; no permite mezclar varias opciones para distintas unidades del mismo producto dentro de una única línea. Sigue pendiente el modelo de múltiples grupos independientes y selección por unidad.
- El total y los detalles de una comanda nueva incorporan el recargo de la opción seleccionada. La foto no se guarda en la comanda.
- Todas las fotografías y datos se guardan solo en localStorage del navegador, con límites de espacio y sin respaldo ni sincronización Firebase. No utilizar como catálogo real hasta disponer de Storage y persistencia segura.
- Las comandas antiguas mantienen sus datos originales. No se han eliminado ni vuelto a ingresar productos.

## Administración / apariencia — demo local
- Se agregó una sección de **personalización personal** (no global): cuatro paletas, densidad compacta/equilibrada/botones grandes, nombre de cabecera y logo procesado a miniatura local.
- La apariencia se guarda aparte de los datos de pedidos, por UID de Firebase **en este navegador**. No se comparte, no modifica el catálogo, no sube fotos a Storage ni altera Firestore.
- El panel de Usuarios y Permisos **solo explica la matriz prevista**; NO crea usuarios, asigna roles ni impone permisos reales. Estar autenticado NO supone ser administrador.
- Falta implementar y auditar autorización segura de roles/grupos/acciones antes de utilizar cualquier dato real o permitir cambios de configuración global.

## Respaldo y recuperación manual (demo)
- En Administración, botón «Descargar respaldo JSON» exporta las colecciones locales de pedidos, clientes, productos (incluyendo fotos), stock, pagos, movimientos y cierres bajo el formato versionado `gula2-local-demo-backup` v1.
- La exportación no incluye credenciales de Firebase ni preferencias personales de apariencia, ni las plantillas locales de informes.
- Para recuperar, seleccionar un archivo JSON compatible. El programa presenta una vista previa con conteos y solo permite continuar tras revisión, confirmación y escritura de la palabra RESTAURAR.
- La recuperación **reemplaza** todos los datos locales de prueba de ese UID y navegador. No se mezclan registros ni se sincroniza a Firebase. Se rechazan respaldos de otro UID, archivos mayores de 5 MB y varios errores de estructura.
- Conviene descargar un respaldo actual y confirmar su disponibilidad en Archivos antes de restaurar. Un respaldo descargado puede contener nombres, correos, teléfonos y observaciones; mantenerlo privado.
- Esta función no sustituye copias automáticas, transacciones, control de acceso ni sincronización en tiempo real y está pendiente de pruebas en Safari iPhone y Android.

## Diagnóstico antes de sincronizar (demo local)
- Administración incluye «Preparación de sincronización» con un chequeo **solo local**; no se hacen lecturas/escrituras Firestore.
- Revisa números de comanda, IDs de clientes/productos repetidos, valores negativos o inválidos de stock/precio/cobros, pagos mayores al total, devoluciones mayores a lo cobrado, referencias faltantes, cierres duplicados y comandas antiguas no vinculadas a clientes/reservas.
- Ofrece un resumen de errores/advertencias y descarga JSON del diagnóstico. El reporte **no incluye todo el contenido de las comandas**, pero sí puede incluir nombres y números: mantener privado.
- Una validación sin errores no certifica permisos, seguridad, sincronización, compatibilidad entre dispositivos ni concurrencia; NO autoriza uso en producción.
- Próxima fase: definir modelo de datos y permisos de servidor; con reglas Firestore cerradas no hay sincronización y no deben abrirse reglas generales para un prototipo.

## Preparación de Firestore sin despliegue (2026-11)
- Se creó `firebase/firestore.rules` con política `deny all` **de referencia**. No se desplegó al proyecto Firebase.
- `firebase/data-model.md` documenta el modelo previsto con empresas, miembros, roles, catálogo, inventario, comandas, pagos, devoluciones, Caja y auditoría.
- `firebase/acceptance-tests.md` documenta las pruebas que faltan ejecutar antes de permitir sincronización.
- Administración muestra el estado real de cada componente; todavía no se ha activado lectura/escritura de Firestore ni migración de datos.
- La decisión de producción debe incluir seguridad por acción, transacciones e idempotencia, verificación entre dispositivos y costo bajo el plan Spark. El sistema anterior permanece intacto.
