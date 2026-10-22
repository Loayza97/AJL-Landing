import { handleEquipoExcel } from '../../../server/handlers/equipo.mjs';
import { makeEquipoDeps } from '../../../server/equipo/deps.mjs';

export const onRequest = (ctx) => handleEquipoExcel(ctx.request, ctx.env, makeEquipoDeps(ctx.env));
