import { handleRevisionCobros } from '../../../server/handlers/suscripciones.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = (ctx) => handleRevisionCobros(ctx.request, ctx.env, makeReservasDeps(ctx.env, ctx));
