// Envío de correos por Resend, compartido por todas las funciones. Nunca lanza:
// un correo que falla no debe tumbar un reclamo guardado ni un pago confirmado.
const RESEND_URL = 'https://api.resend.com/emails';

export function crearSendEmail(env, fetchImpl = fetch) {
  return async function sendEmail({ from, to, subject, html }) {
    try {
      const r = await fetchImpl(RESEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html }),
      });
      if (!r.ok) console.error('Resend error', r.status, await r.text());
      return r.ok;
    } catch (e) {
      console.error('Resend sin respuesta', e);
      return false;
    }
  };
}
