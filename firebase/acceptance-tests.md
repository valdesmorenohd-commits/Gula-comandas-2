# Gula 2.0 — Pruebas obligatorias antes de habilitar sincronización

Checklist técnico, **no ejecutado**. No certifica producción.

## Acceso
- [ ] Firebase Auth válido pero sin membresía: lectura/escritura rechazada.
- [ ] Usuario activo con permiso de lectura no puede editar, pagar ni cerrar.
- [ ] Usuario con permiso parcial no puede cambiar permisos, empresa ni su propio rol.
- [ ] Datos de otra empresa jamás aparecen en consultas o URLs adivinadas.
- [ ] Ningún usuario puede alterar `createdAt`, `actorUid`, `businessId`, auditoría o números de comanda arbitrariamente.

## Pedidos y stock
- [ ] Dos dispositivos solicitan el último producto simultáneamente: solo una reserva válida.
- [ ] Guardar pedido después de error de red y reintento: no se duplica número, venta ni stock.
- [ ] Editar cantidades ajusta el diferencial de stock una sola vez.
- [ ] Anular una comanda dos veces: una sola liberación de stock.
- [ ] Comandas antiguas sin reserva: jamás liberar unidades no reservadas.
- [ ] Cambiar precio del catálogo no altera subtotales históricos.

## Pagos y Caja
- [ ] Reintento de pago con misma clave: un cobro y un movimiento de Caja.
- [ ] Dos abonos simultáneos no pueden superar saldo (salvo flujo explícito de sobrepago controlado).
- [ ] Devolución no supera cobros netos ni se registra dos veces.
- [ ] Anular no genera reembolso automático.
- [ ] Cierre requiere revisión de pendientes y saldo físico; se bloquean movimientos posteriores sin reapertura autorizada.
- [ ] No hay diferencia entre cifras de Caja e Informes calculadas desde los mismos eventos.

## Offline / recuperación
- [ ] Pedido offline se identifica como provisional hasta aceptación del servidor.
- [ ] Un conflicto de stock se muestra para resolución y no se confirma silenciosamente.
- [ ] Copia previa y restauración probadas con datos sintéticos, sin perder originales.
- [ ] iPhone, computador y tablet coinciden al sincronizar cuando el servidor acepta transacciones.
