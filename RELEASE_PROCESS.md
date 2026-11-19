# Gula Comandas 2.0 — proceso de actualizaciones

**Estado: preparado, no habilita producción.** La rama `main` sigue publicando la demostración actual mediante GitHub Pages. La rama `gula2-desarrollo` permite elaborar cambios sin publicarlos en Pages hasta integrarlos. Firestore permanece cerrado y las comandas siguen siendo locales al navegador.

## Flujo previsto

1. **Desarrollo:** hacer nuevas modificaciones en `gula2-desarrollo`, sin tocar directamente `main`.
2. **Revisión técnica:** ejecutar `node scripts/check-app.mjs`; si GitHub Actions está disponible, revisar su estado en la pestaña Actions (un archivo de workflow no garantiza que Actions esté habilitado).
3. **Pruebas reales:** validar en Safari iPhone, Chrome Windows y tablet Android. Probar flujos de Nueva comanda, edición, stock, Caja e Informes; usar **datos sintéticos**.
4. **Control de datos:** antes de cualquier migración, descargar y verificar una copia restaurable, conservar respaldo separado y plan de recuperación. Nunca borrar el almacenamiento del navegador como método de actualizar la interfaz.
5. **Revisión de publicación:** comparar cambios de rama, revisar permisos/reglas, confirmar que no hay datos ni credenciales privadas en el repositorio y documentar la versión.
6. **Integración controlada:** solo tras aprobación de la modificación, incorporar cambios de `gula2-desarrollo` a `main`. Conservar un identificador del commit anterior para poder revertir código. **Volver a código anterior no necesariamente revierte una migración de base de datos.**
7. **Comprobación posterior:** probar el flujo principal en GitHub Pages y confirmar que los registros existentes siguen accesibles.

## Separación de ambientes

- Actual: **una app de demostración publicada en `main`**. La nueva rama de desarrollo **no tiene una URL de previsualización configurada**.
- Objetivo antes de ventas reales: aplicación y base de datos de pruebas separadas de producción, cuentas y permisos específicos de cada ambiente, respaldos verificables, aprobación de cambios y despliegues controlados.
- Ningún archivo de este cambio crea un proyecto Firebase de producción, cambia reglas activas ni contrata servicios.
- No debe usarse una base de datos compartida entre pruebas y producción.

## Qué se podrá cambiar sin reiniciar el historial

Colores, logo, interfaz, menús, orden de filtros, formato de impresión, informes y nuevas funciones pueden actualizarse sin reiniciar pedidos **siempre que la implementación respete el esquema de datos y su migración**. Cambios de pagos, stock, cierres o relaciones entre documentos necesitan pruebas transaccionales, permisos y migraciones compatibles.

## Puntos que todavía bloquean producción

- Persistencia central segura con permisos de usuario auditables.
- Transacciones o flujo confiable que impidan sobreventa y cobros duplicados.
- Operación offline con cola provisional y reconciliación.
- Respaldo automático y restauración probada.
- Impresión cliente de 58 mm probada desde iPhone.
- Pruebas reales de interfaces y conciliación de Caja.

La cocina, sus estados e impresora se mantienen para la fase final según el alcance acordado.
