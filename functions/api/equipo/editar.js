import { handleEditar } from '../../../server/handlers/equipo-editar.mjs';
import { makeEquipoDeps } from '../../../server/equipo/deps.mjs';

export const onRequest = (ctx) => handleEditar(ctx.request, ctx.env, makeEquipoDeps(ctx.env));
