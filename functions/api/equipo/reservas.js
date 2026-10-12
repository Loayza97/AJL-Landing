import { handleEquipoReservas } from '../../../server/handlers/equipo.mjs';
import { makeEquipoDeps } from '../../../server/equipo/deps.mjs';

export const onRequest = (ctx) => handleEquipoReservas(ctx.request, ctx.env, makeEquipoDeps(ctx.env));
