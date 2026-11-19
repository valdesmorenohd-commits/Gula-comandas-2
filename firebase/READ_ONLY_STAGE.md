# Gula 2.0 — etapa Firestore: lectura aislada y pruebas

**Estado:** preparado solamente en rama `gula2-desarrollo`. La app principal NO usa Firestore para sus comandas. No se ha cambiado el proyecto Firebase ni desplegado reglas.

## Archivos y diferencias

- `firebase/firestore.rules` — bloqueo total original **intacto**. Sigue siendo la única política base declarada.
- `firebase/firestore.readonly-preview.rules` — política alternativa de **solo lectura**, pensada para pruebas locales con emulador. NO publicar automáticamente.
- `scripts/test-firestore-rules.mjs` — pruebas con usuarios simulados, aislamiento entre empresas, consulta y prohibición de escrituras.

El borrador permite leer colecciones específicas solo cuando existe un documento `businesses/{businessId}/members/{uid}` con `uid`, `businessId`, `active: true` y `roleId` permitido. Un usuario sin membresía o desactivado no ve datos. `consulta` puede consultar pedidos, productos, cobros e informes, pero no fichas personales de clientes ni cambios de inventario; `personal` y `principal_admin` tienen más lecturas.

**Nadie puede escribir desde la app**, incluidos administradores. El borrador no pretende hacer ventas reales. La escritura de comandas, pagos, inventario, devoluciones y cierres requerirá transacciones fiables, reglas adicionales y pruebas.

## Cómo ejecutar pruebas locales (opcional; requiere PC y Node)

En un computador con Node y Firebase CLI instalados, usar un proyecto de emulador **ficticio**. Ejemplo:

```bash
npm install --no-save @firebase/rules-unit-testing firebase
firebase emulators:exec --project gula2-rules-local-test --only firestore --config firebase/emulator-test.json "node scripts/test-firestore-rules.mjs"
```

La configuración local está en `firebase/emulator-test.json` y apunta explícitamente al archivo original **cerrado**. El propio test carga la política alternativa para el entorno aislado.

> No ejecutar `firebase deploy` con el archivo de pruebas ni elegir el proyecto real de Firebase para el emulador. No copiar credenciales ni datos de clientes al repositorio. El emulador trabaja con datos totalmente ficticios.

## Próximo punto de control técnico

1. Ejecutar la batería en el emulador y comprobar todos los permisos esperados.
2. Revisar que las reglas no filtren clientes, pagos o información sensible a perfiles inadecuados.
3. Implementar operaciones transaccionales en entorno aparte, con claves de idempotencia y concurrencia.
4. Solo entonces configurar un entorno de pruebas remoto, con autorización real y sin migrar automáticamente información actual.
5. Mantener el paso a producción bloqueado hasta tener recuperación de respaldos, sincronización y pruebas reales entre iPhone/PC/tablet.

Referencias oficiales: https://firebase.google.com/docs/firestore/security/rules-conditions y https://firebase.google.com/docs/rules/unit-tests
