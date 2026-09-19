#!/usr/bin/env python3
"""Genera las 5 stories (1080×1920) de «Así funciona» a partir del componente
HowItWorks.astro: mismo texto y mismos dibujos que la web, para que no diverjan.

Uso:  python3 build.py        → escribe story-N.html y story-N.png aquí mismo.
"""
import re, subprocess, pathlib

HERE = pathlib.Path(__file__).parent
ASTRO = HERE.parent.parent / 'src' / 'components' / 'HowItWorks.astro'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

src = ASTRO.read_text()

# Pasos: texto literal del componente.
steps = []
for m in re.finditer(r"n: (\d+),\s*title: '([^']+)',\s*lines: \[([^\]]+)\],\s*art: '(\w+)'", src):
    n, title, lines, art = m.groups()
    steps.append({
        'n': int(n), 'title': title, 'art': art,
        'lines': re.findall(r"'([^']+)'", lines),
    })

# Dibujos: el <svg> de cada paso, tal cual.
svgs = {}
for art in [s['art'] for s in steps]:
    i = src.index(f"{{s.art === '{art}' && (")
    a = src.index('<svg', i); b = src.index('</svg>', a) + len('</svg>')
    svgs[art] = src[a:b]

# Colores de los dibujos: el bloque de clases del componente.
i = src.index('/* Colores de los dibujos'); j = src.index('.sr-only', i)
svg_css = src[i:j]

TAG = 'Solo planes con acompañamiento'
FOOT = 'La sesión única incluye los pasos 1 al 3.'
ENTRY = 'Eliges tu plan, lo pagas y te mandamos el calendario. <strong>Desde ahí:</strong>'

TEMPLATE = '''<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700;9..144,900&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
:root {{
  --verde: #2F6E52; --verde-osc: #173C2C; --verde-claro: #E9F1EB;
  --dorado: #D68A5C; --dorado-osc: #BE6E42; --dorado-claro: #F6E5D9;
  --crema: #FBF7F1; --ink: #20302A; --gris: #5E6B63; --white: #fff;
}}
* {{ box-sizing: border-box; margin: 0; }}
html, body {{ width: 1080px; height: 1920px; overflow: hidden; }}
body {{
  background: var(--crema); color: var(--ink);
  font-family: 'Inter', system-ui, sans-serif;
  display: flex; flex-direction: column;
  padding: 220px 90px 240px;   /* zonas seguras de Instagram arriba y abajo */
}}
.kicker {{
  font-size: 30px; font-weight: 700; letter-spacing: 6px; text-transform: uppercase;
  color: var(--dorado); margin-bottom: 18px;
}}
.entry {{ font-size: 34px; line-height: 1.4; color: var(--ink); margin-bottom: 40px; }}
.entry strong {{ color: var(--verde-osc); }}
.card {{
  position: relative; background: var(--white); border-radius: 44px;
  padding: 44px 44px 60px; box-shadow: 0 30px 80px rgba(23,60,44,.12);
  flex: 1; display: flex; flex-direction: column;
}}
.card--acomp {{ border: 6px solid var(--dorado-claro); }}
.art {{
  background: var(--verde-claro); border-radius: 32px; padding: 60px 50px;
  flex: 1; display: flex; align-items: center; margin-bottom: 52px;
}}
.card--acomp .art {{ background: var(--dorado-claro); }}
.art svg {{ width: 100%; height: auto; max-height: 100%; }}
.num {{
  position: absolute; top: 20px; left: 20px; width: 120px; height: 120px; border-radius: 50%;
  display: grid; place-items: center; background: var(--verde-osc); color: var(--white);
  font-family: 'Fraunces', Georgia, serif; font-weight: 700; font-size: 62px;
  box-shadow: 0 12px 30px rgba(23,60,44,.3);
}}
.card--acomp .num {{ background: var(--dorado); }}
.tag {{
  align-self: flex-start; font-size: 26px; font-weight: 700; letter-spacing: 3px;
  text-transform: uppercase; color: var(--dorado-osc); background: var(--dorado-claro);
  padding: 14px 30px; border-radius: 999px; margin-bottom: 26px;
}}
h1 {{
  font-family: 'Fraunces', Georgia, serif; font-weight: 700; font-size: 74px;
  line-height: 1.12; color: var(--verde-osc); letter-spacing: -1px; margin-bottom: 26px;
}}
.line {{ font-size: 40px; line-height: 1.45; color: var(--gris); }}
.line + .line {{ margin-top: 14px; }}
.foot {{ margin-top: 40px; font-size: 32px; font-weight: 600; color: var(--verde-osc); }}
.brand {{
  position: absolute; left: 0; right: 0; bottom: 120px; text-align: center;
  font-size: 28px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: var(--verde);
}}
{svg_css}
</style></head>
<body>
  <p class="kicker">Así funciona · Paso {n} de 5</p>
  {entry}
  <div class="card{acomp}">
    <span class="num">{n}</span>
    <div class="art">{svg}</div>
    {tag}
    <h1>{title}</h1>
    {lines}
    {foot}
  </div>
  <p class="brand">AJL Nutrición</p>
</body></html>
'''

for s in steps:
    n = s['n']; acomp = n >= 4
    html = TEMPLATE.format(
        svg_css=svg_css, n=n, svg=svgs[s['art']],
        entry=f'<p class="entry">{ENTRY}</p>' if n == 1 else '',
        acomp=' card--acomp' if acomp else '',
        tag=f'<span class="tag">{TAG}</span>' if n == 4 else '',
        title=s['title'],
        lines=''.join(f'<p class="line">{l}</p>' for l in s['lines']),
        foot=f'<p class="foot">{FOOT}</p>' if n == 5 else '',
    )
    out = HERE / f'story-{n}.html'
    out.write_text(html)
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                    '--timeout=15000', '--window-size=1080,1920',
                    f'--screenshot={HERE / f"story-{n}.png"}', f'file://{out}'],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print('ok', out.name)
