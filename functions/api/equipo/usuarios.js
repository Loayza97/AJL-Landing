import { handleUsuarios } from '../../../server/handlers/equipo-usuarios.mjs';
import { makeEquipoDeps } from '../../../server/equipo/deps.mjs';

export const onRequest = (ctx) => handleUsuarios(ctx.request, ctx.env, makeEquipoDeps(ctx.env));
