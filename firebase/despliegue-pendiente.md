# Gula Comandas 2.0 — Preparación de despliegue, SIN ACTIVAR SERVICIOS

**Estado:** solo código en la rama `ventas-firebase-mvp`. La web publicada sigue siendo una demostración local. No desplegar aún.

## Acuerdo de infraestructura
- Proyecto Google Firebase: `gula-comandas-2-0-pruebas`.
- Repositorio de la nueva app: `valdesmorenohd-commits/Gula-comandas-2`.
- Firebase Authentication + Firestore + Cloud Functions (Node 20; región `southamerica-west1`).
- Alojamiento del frontend: GitHub Pages actual.
- El propietario **pospone Blaze y la configuración de facturación hasta cobrar a fin de mes**. No activar servicios, registrar tarjeta, desplegar Functions ni crear costos antes de su autorización. No migrar a Apps Script ni rediseñar por ese motivo.

## Comprobaciones que pueden completarse antes de fin de mes
- Reglas Firestore probadas con emulador, permisos y lectura/escritura.
- Pruebas de servidor: numeración, stock por fecha, precios y variantes, abonos, devoluciones, cierres y reintentos.
- Formularios de usuario, clientes, productos, comandas y caja.
- Informes de pedidos y movimientos separados por tipo de fecha y filtros, indicando que el visor actual carga como máximo 200 documentos de cada tipo.
- Impresión HTML 58/80 mm preparada, pendiente de prueba física iPhone/impresora.

## Lista de publicación una vez Blaze sea autorizado
1. Confirmar que la cuenta administradora del proyecto Firebase y la facturación son correctas y que el propietario ha aprobado el cambio de plan. Revisar presupuesto y alertas de Google Cloud; **una alerta no es un límite de gasto duro**.
2. Revisar que `.firebaserc` apunta al proyecto correcto. Obtener aprobación explícita para publicar reglas y Functions. No incluir claves de servicio en GitHub.
3. Comprobar `npm run test:rules` con Firestore Emulator y CI verde. Comprobar las reglas comerciales exactas y permisos de miembros existentes.
4. Respaldar/exportar los datos existentes del proyecto antes de cualquier cambio. Verificar el backup y conservar copia aparte. No importar la demo local ni el historial del sistema anterior sin consentimiento específico.
5. Desplegar reglas Firestore y las funciones desde un entorno autorizado y con configuración de CLI validada. **No desplegar Functions hasta contar con Blaze.**
6. Probar con cuentas reales autorizadas en la nube: comanda con varios productos y variante, cambio de fecha, stock, pago parcial/TEF, devolución, anulación, cierre y reapertura.
7. Verificar acceso y sincronización entre el iPhone, el dispositivo de Felipe, PC Windows y tablet Android. Probar impresión cliente/cocina y comportamiento al perder la conexión durante un cobro.
8. Completar respaldo **automático** y restauración comprobada; no confundir exportación manual con respaldo automático.
9. Auditar cobertura de permisos individualizados, el límite actual de 200 registros en el visor de informes y las demás características pendientes. Realizar prueba integral de operación antes de habilitar la web para ventas.
10. Publicar después de aprobar todas las pruebas y conservar el sistema anterior y su historial sin modificaciones.

## Importante
El código de la rama es preparación; no equivale a infraestructura desplegada ni garantiza que se haya realizado una venta real. No fusionar a `main` hasta completar pruebas y autorización. Mantener la web actual y el historial previo intactos.
