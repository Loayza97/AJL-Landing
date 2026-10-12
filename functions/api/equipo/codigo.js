import { handlePedirCodigo } from '../../../server/equipo/acceso.mjs';
import { makeEquipoDeps } from '../../../server/equipo/deps.mjs';

export const onRequest = (ctx) => handlePedirCodigo(ctx.request, ctx.env, makeEquipoDeps(ctx.env));
