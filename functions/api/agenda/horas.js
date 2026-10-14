import { handleAgendaHoras } from '../../../server/handlers/agenda.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = (ctx) => handleAgendaHoras(ctx.request, ctx.env, makeReservasDeps(ctx.env, ctx));
