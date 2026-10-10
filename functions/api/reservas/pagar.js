import { handlePagar } from '../../../server/handlers/reservas.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = (ctx) => handlePagar(ctx.request, ctx.env, makeReservasDeps(ctx.env, ctx));
