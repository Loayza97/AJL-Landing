// Prueba manual de suscripciones de Mercado Pago (modo de prueba). No es parte del sitio.
// Uso: MP_ACCESS_TOKEN=TEST-... EMAIL=comprador_de_prueba@testuser.com node scripts/mp-suscripcion-prueba.mjs crear
//      MP_ACCESS_TOKEN=TEST-... node scripts/mp-suscripcion-prueba.mjs comprador
//      MP_ACCESS_TOKEN=TEST-... node scripts/mp-suscripcion-prueba.mjs ver <preapproval_id>
//      MP_ACCESS_TOKEN=TEST-... node scripts/mp-suscripcion-prueba.mjs cobros <preapproval_id>
//      MP_ACCESS_TOKEN=TEST-... node scripts/mp-suscripcion-prueba.mjs cancelar <preapproval_id>
const API = 'https://api.mercadopago.com';
// Si no viene MP_ACCESS_TOKEN, lo pide en la terminal (no queda en el historial).
if (!process.env.MP_ACCESS_TOKEN) {
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  process.env.MP_ACCESS_TOKEN = (await rl.question('Pega tu access token de prueba (TEST-...) y Enter: ')).trim();
  if (!process.env.EMAIL && process.argv[2] === 'crear') process.env.EMAIL = (await rl.question('Correo del comprador de prueba: ')).trim();
  rl.close();
}
const auth = { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' };
const [accion, id] = process.argv.slice(2);
const mostrar = async (r) => console.log(r.status, JSON.stringify(await r.json(), null, 2));

if (accion === 'crear') {
  const fin = new Date(Date.now() + 75 * 86400000).toISOString();
  await mostrar(await fetch(`${API}/preapproval`, { method: 'POST', headers: auth, body: JSON.stringify({
    reason: 'AJL Nutrición · prueba de suscripción', external_reference: `prueba-${Date.now()}`,
    payer_email: process.env.EMAIL, back_url: 'https://reservas-pago.ajl-landing.pages.dev/reservar/listo/',
    status: 'pending', auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 10, currency_id: 'PEN', end_date: fin },
  }) }));
} else if (accion === 'comprador') {
  // Crea un comprador de prueba de Perú y muestra su correo, usuario y contraseña.
  await mostrar(await fetch(`${API}/users/test`, { method: 'POST', headers: auth, body: JSON.stringify({ site_id: 'MPE', description: 'comprador suscripciones AJL' }) }));
} else if (accion === 'ver') {
  await mostrar(await fetch(`${API}/preapproval/${id}`, { headers: auth }));
} else if (accion === 'cobros') {
  await mostrar(await fetch(`${API}/authorized_payments/search?preapproval_id=${id}`, { headers: auth }));
} else if (accion === 'cancelar') {
  await mostrar(await fetch(`${API}/preapproval/${id}`, { method: 'PUT', headers: auth, body: JSON.stringify({ status: 'cancelled' }) }));
} else {
  console.log('Acción: comprador | crear | ver <id> | cobros <id> | cancelar <id>');
}
