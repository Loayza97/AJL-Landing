import { handleHoras } from '../../../server/handlers/reservas.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = ({ request, env }) => handleHoras(request, env, makeReservasDeps(env));
