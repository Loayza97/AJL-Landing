import { handleEstado } from '../../../server/handlers/reservas.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = (ctx) => handleEstado(ctx.request, ctx.env, makeReservasDeps(ctx.env, ctx));
