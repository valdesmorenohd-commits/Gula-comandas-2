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
