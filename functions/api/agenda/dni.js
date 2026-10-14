import { handleAgendaDni } from '../../../server/handlers/agenda.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = (ctx) => handleAgendaDni(ctx.request, ctx.env, makeReservasDeps(ctx.env, ctx));
