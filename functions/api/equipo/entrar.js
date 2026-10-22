import { handleEntrar } from '../../../server/equipo/acceso.mjs';
import { makeEquipoDeps } from '../../../server/equipo/deps.mjs';

export const onRequest = (ctx) => handleEntrar(ctx.request, ctx.env, makeEquipoDeps(ctx.env));
