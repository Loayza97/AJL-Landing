import { handleAb } from '../../server/handlers/ab.mjs';

export const onRequest = (ctx) => handleAb(ctx.request, ctx.env, { db: ctx.env.DB, ahora: () => new Date() });
