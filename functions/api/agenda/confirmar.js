import { handleAgendaConfirmar } from '../../../server/handlers/agenda.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = (ctx) => handleAgendaConfirmar(ctx.request, ctx.env, makeReservasDeps(ctx.env, ctx));
