import { defineConfig } from 'astro/config';

export default defineConfig({
  // Dominio canónico del sitio: debe coincidir con el dominio PRIMARIO de
  // Vercel. Hoy el apex (ajlnutricion.com) redirige al www, así que el www es
  // el que Google indexa y el que declaramos aquí. Si algún día se invierte el
  // redirect en Vercel, este valor se cambia y todo lo absoluto (canonical, OG,
  // schema) se recalcula solo; el sitemap y robots.txt sí hay que editarlos.
  site: 'https://www.ajlnutricion.com',
  compressHTML: true,
});
