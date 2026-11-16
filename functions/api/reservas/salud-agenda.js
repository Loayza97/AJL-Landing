import { handleSaludAgenda } from '../../../server/handlers/reservas.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = (ctx) => handleSaludAgenda(ctx.request, ctx.env, makeReservasDeps(ctx.env, ctx));
