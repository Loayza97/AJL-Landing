import { handleAgendaRobot } from '../../../server/handlers/agenda-robot.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = (ctx) => handleAgendaRobot(ctx.request, ctx.env, makeReservasDeps(ctx.env, ctx));
