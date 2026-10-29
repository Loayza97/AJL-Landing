import { handleSuscripcionCancelar } from '../../../server/handlers/suscripciones.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = (ctx) => handleSuscripcionCancelar(ctx.request, ctx.env, makeReservasDeps(ctx.env, ctx));
