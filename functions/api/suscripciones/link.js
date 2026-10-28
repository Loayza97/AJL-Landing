import { handleSuscripcionLink } from '../../../server/handlers/suscripciones.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = (ctx) => handleSuscripcionLink(ctx.request, ctx.env, makeReservasDeps(ctx.env, ctx));
