import { handleHoras } from '../../../server/handlers/reservas.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = (ctx) => handleHoras(ctx.request, ctx.env, makeReservasDeps(ctx.env, ctx));
