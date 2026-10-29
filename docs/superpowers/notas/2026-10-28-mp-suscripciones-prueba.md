# Mercado Pago suscripciones: notas de la prueba en modo de prueba

Joaquín corre el script `scripts/mp-suscripcion-prueba.mjs` con credenciales de prueba (nunca se pegan en el chat).

- 1. Crear preapproval, autorizar con tarjeta de prueba y medir cuánto tarda en aparecer el cobro en `cobros`. Resultado: pendiente
- 2. Autorizar con Yape de prueba y con tarjeta de débito de prueba, si el modo de prueba lo permite. Resultado: pendiente
- 3. Crear con un `EMAIL` distinto al del comprador y anotar si Mercado Pago lo rechaza. Resultado: pendiente
- 4. Anotar los valores exactos de `status` del preapproval y de cada authorized payment, y si el pago trae `external_reference`. Resultado: pendiente
- 5. Cancelar y confirmar `status: "cancelled"` con `ver`. Resultado: pendiente
- 6. Con tarjeta de prueba que rechace (`OTHE`), anotar el `status` del authorized payment mientras reintenta y al rendirse. Resultado: pendiente
- 7. Activar los eventos «Planes y suscripciones» en el panel de Webhooks (modo de prueba y producción), anotar el `type` y el `data.id` de un aviso real. Resultado: pendiente
