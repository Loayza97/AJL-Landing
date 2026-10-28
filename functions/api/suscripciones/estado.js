import { handleSuscripcionEstado } from '../../../server/handlers/suscripciones.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = (ctx) => handleSuscripcionEstado(ctx.request, ctx.env, makeReservasDeps(ctx.env, ctx));
