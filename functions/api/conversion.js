import { handleConversion } from '../../server/handlers/conversion.mjs';
import { makeDeps } from '../../server/deps.mjs';

export const onRequest = ({ request, env }) => handleConversion(request, env, makeDeps(env));
