import { handleEquipoPorAgendar } from '../../../server/handlers/equipo-por-agendar.mjs';
import { makeEquipoDeps } from '../../../server/equipo/deps.mjs';

export const onRequest = (ctx) => handleEquipoPorAgendar(ctx.request, ctx.env, makeEquipoDeps(ctx.env));
