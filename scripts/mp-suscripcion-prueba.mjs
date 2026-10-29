// Prueba manual de suscripciones de Mercado Pago (modo de prueba). No es parte del sitio.
// Uso: MP_ACCESS_TOKEN=TEST-... node scripts/mp-suscripcion-prueba.mjs crear       (plan de S/10, 1 cobro; abre su init_point)
//      MP_ACCESS_TOKEN=TEST-... node scripts/mp-suscripcion-prueba.mjs plan <preapproval_plan_id>   (su preapproval)
//      MP_ACCESS_TOKEN=TEST-... node scripts/mp-suscripcion-prueba.mjs comprador
//      MP_ACCESS_TOKEN=TEST-... node scripts/mp-suscripcion-prueba.mjs ver <preapproval_id>
//      MP_ACCESS_TOKEN=TEST-... node scripts/mp-suscripcion-prueba.mjs cobros <preapproval_id>
//      MP_ACCESS_TOKEN=TEST-... node scripts/mp-suscripcion-prueba.mjs cancelar <preapproval_id>
const API = 'https://api.mercadopago.com';
// Sin acción, crea un comprador de prueba (lo más común al empezar).
if (!process.argv[2]) process.argv[2] = 'comprador';
// Si no viene MP_ACCESS_TOKEN, lo pide en la terminal (no queda en el historial).
if (!process.env.MP_ACCESS_TOKEN) {
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  process.env.MP_ACCESS_TOKEN = (await rl.question('Pega el access token de la versión de prueba (empieza con TEST- o APP_USR-) y Enter: ')).trim();
  if (!/^(TEST|APP_USR)-/.test(process.env.MP_ACCESS_TOKEN)) {
    console.log('Eso no es un access token: es un texto largo que empieza con TEST- o APP_USR-. El usuario TESTUSER... no sirve aquí.');
    process.exit(1);
  }
  rl.close();
}
const auth = { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' };
const [accion, id] = process.argv.slice(2);
const mostrar = async (r) => console.log(r.status, JSON.stringify(await r.json(), null, 2));

if (accion === 'crear') {
  // Como el sitio: un plan sin payer_email; el preapproval lo crea Mercado Pago cuando alguien autoriza en init_point.
  const r = await fetch(`${API}/preapproval_plan`, { method: 'POST', headers: auth, body: JSON.stringify({
    reason: 'AJL Nutrición · prueba de suscripción', back_url: 'https://reservas-pago.ajl-landing.pages.dev/reservar/listo/',
    auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 10, currency_id: 'PEN', repetitions: 1 },
  }) });
  const d = await r.json();
  console.log(r.status, JSON.stringify(d, null, 2));
  if (d.init_point) console.log(`\nAbre para autorizar: ${d.init_point}\nLuego: node scripts/mp-suscripcion-prueba.mjs plan ${d.id}`);
} else if (accion === 'plan') {
  await mostrar(await fetch(`${API}/preapproval/search?preapproval_plan_id=${id}`, { headers: auth }));
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
  console.log('Acción: comprador | crear | plan <plan_id> | ver <id> | cobros <id> | cancelar <id>');
}
