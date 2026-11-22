# Entrega urgente: Gula 2.0 para ventas reales

## Situación comprobada
La web actual (GitHub Pages) **ya está publicada**, pero conserva las comandas, productos, clientes, movimientos y caja en localStorage por **dispositivo y UID**. Firebase solo guarda y protege las membresías. Publicación web != autorización para usar el sistema con ventas reales.

## Alcance mínimo para poder vender desde Gula 2.0
1. Pedidos, productos, clientes, pagos, movimientos de caja e inventario deben persistir y sincronizarse en Firestore (o backend equivalente) para los dos usuarios, con permisos por operación.
2. Escrituras críticas de pagos, devoluciones, stock y totales deben validarse en el servidor, con operaciones atómicas y auditoría; la web no debe convertirse en autoridad.
3. Debe existir copia de seguridad comprobada y restauración ensayada sin sobrescribir el historial del sistema anterior.
4. Se debe probar una venta completa de punta a punta en iPhone y otro dispositivo: crear, entregar, cobrar, editar/anular, imprimir, cerrar caja y recuperar el registro.
5. Probar desconexión, reintentos y conflictos de datos para no duplicar ventas ni cobrar dos veces.
6. **Hasta entonces:** mantener los pedidos reales en el sistema anterior que ya funcione, o en un registro operativo alternativo con respaldo fiable. No cargar ventas reales en la demo local de Gula 2.0.

## Cambios en esta rama
- Se prepara `src/cloud-order-drafts.mjs` y permisos restringidos para **borradores en Firestore** exclusivamente.
- El nuevo módulo NO se importa ni usa desde la web publicada. Tampoco permite cobrar, gestionar stock ni editar.
- No se publican reglas desde GitHub.
- Queda pendiente especificar e implementar la secuencia de ventas reales. No anunciar lanzamiento hasta aprobar esa secuencia.
