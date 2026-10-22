import { handleAgendaLink } from '../../../server/handlers/agenda.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = (ctx) => handleAgendaLink(ctx.request, ctx.env, makeReservasDeps(ctx.env, ctx));
