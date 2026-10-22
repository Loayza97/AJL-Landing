import { handleSalir } from '../../../server/equipo/acceso.mjs';
import { makeEquipoDeps } from '../../../server/equipo/deps.mjs';

export const onRequest = (ctx) => handleSalir(ctx.request, ctx.env, makeEquipoDeps(ctx.env));
