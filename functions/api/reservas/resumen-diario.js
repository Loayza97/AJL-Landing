import { handleResumenDiario } from '../../../server/handlers/reservas.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = (ctx) => handleResumenDiario(ctx.request, ctx.env, makeReservasDeps(ctx.env, ctx));
