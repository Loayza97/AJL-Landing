import { handleWebhookMp } from '../../../server/handlers/reservas.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = ({ request, env }) => handleWebhookMp(request, env, makeReservasDeps(env));
