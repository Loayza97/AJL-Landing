# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a workspace organized by business areas (rubros) containing commercial projects, automations, and research.

## Development Setup

```bash
# Activate virtual environment (Python projects)
source 04-automatizaciones/tooling/venv/bin/activate

# Generate PDFs from Markdown/HTML
./04-automatizaciones/tooling/utils/generate_pdf.sh input.md output.pdf
```

## Project Structure

The workspace is organized by business areas:

- `01-direccion-estrategica/` - Corporate strategy and high-level planning
- `02-comercial/` - Commercial projects and sales systems
  - `proyecto-nutricion/` - Complete nutrition business project (5 phases)
- `03-marketing/` - Marketing campaigns and content
- `04-automatizaciones/` - Automation scripts and tools
  - **Proyectos (Core):**
    - `Sistema de extracción de data nutricional/` - Nutrition data extraction system documentation
    - `notion-sync/` - Notion synchronization (config + sync state)
    - `whatsapp-resumenes/` - WhatsApp summary automation
  - **Tooling (Infrastructure):**
    - `tooling/utils/` - Utilities (PDF generator)
    - `tooling/tests/` - Test files and experiments
    - `tooling/venv/` - Python 3.9 environment
    - `tooling/venv-pdf/` - Python 3.11 + WeasyPrint environment
- `05-educacion-nutricional/` - Nutritional education and research
  - `curriculum-antifragil/` - Patient competency curriculum + assessment instruments
  - `investigacion/` - Nutrition research, papers, and protocols

## Project Tracking System

Each rubro has a `_tracking/` folder for project management:

```
[rubro]/
└── _tracking/
    ├── RESUMEN-EJECUTIVO.md      # Executive summary (status, next steps, decisions)
    ├── HISTORIAL-SESIONES.md     # Complete session history log
    └── proyectos/                 # Individual project trackers (optional)
        └── [nombre]-TRACKER.md
```

**Master Tracker:** `/MASTER-TRACKER.md` at ailab root provides a consolidated view of all rubros.

### Before Saving Tracking

Always ask the user these questions before creating or updating tracking files:

1. **Identification:**
   - What should I name this project? (use kebab-case: `nutricion-b2c`)
   - Is this a new project or part of an existing one?

2. **Scope:**
   - Does this project belong only to [XX-rubro] or span multiple rubros?
   - If multiple: which is the primary rubro?

3. **Tracking Level:**
   - Should I create a detailed tracker for this project (like MASTER-TRACKER.md)?
   - Or just update the rubro's executive summary?

4. **Session Classification:**
   - How would you classify this session: trabajo / revision / decision / exploracion?

### Session Logging Format

- Number sessions sequentially: `001`, `002`, `003`
- Record in session entry:
  - Objective of the session
  - Previous context
  - Work completed
  - Decisions made (with reasoning)
  - Problems encountered
  - Final state
  - Next steps
  - Files modified
- Add new sessions at the TOP of HISTORIAL-SESIONES.md (most recent first)
- Use ISO date format: `YYYY-MM-DD`

### Multi-Rubro Projects

- Keep tracking in the PRIMARY rubro
- Add cross-references in related rubros' RESUMEN-EJECUTIVO
- Log sessions where the work was done
- Note the relationship in both executive summaries

## Notion Integration

Notion esta conectado via MCP (`mcp.notion.com`). El hub es la pagina **Command Center** con 3 databases interconectadas.

**Config**: `04-automatizaciones/notion-sync/config.json` (database IDs, project map)
**Sync state**: `04-automatizaciones/notion-sync/data/sync_state.json` (idempotencia)

### Comandos naturales disponibles

| Comando | Accion |
|---------|--------|
| "sincroniza pendientes a Notion" | Push MASTER-TRACKER -> Notion (idempotente via Sync ID) |
| "asigna [tarea] a [persona]" | Busca tarea y persona, crea relacion, cambia estado a `Por Hacer` |
| "backlog de [area/persona]" | Query filtrado de tareas pendientes |
| "estado de [proyecto]" | Muestra progreso, fase, bloqueadores |
| "que hizo [persona] esta semana" | Tareas completadas + en progreso |
| "crea proyecto: [nombre]" | Nuevo proyecto en Notion + carpeta local |
| "sprint planning" | Muestra backlog priorizado + carga del equipo para asignar |
| "carga del equipo" | Tabla de tareas por persona |

### Sync workflow

1. Leer `MASTER-TRACKER.md` y parsear `- [ ]` items
2. Generar sync_id por item (formato: `rubro-slug`)
3. Consultar `sync_state.json` para evitar duplicados
4. Crear paginas nuevas solo para items no existentes
5. Si item es `[x]`, actualizar estado a `Completada`
6. Guardar sync_state actualizado

## Modo Apareamiento de Carta con Formatos Ganadores

Cuando el usuario comparta una carta de restaurante (foto, PDF, lista de platos, o texto con platos y precios), activar automáticamente el modo de apareamiento:

1. **Clonar o actualizar** el repo: `git -C /tmp/ajl-marketing-content pull 2>/dev/null || git clone https://github.com/Loayza97/ajl-marketing-content.git /tmp/ajl-marketing-content`
2. **Leer** `FORMATOS-GANADORES.md` — ranking de formatos y algoritmo de apareamiento
3. **Leer** `plantillas-guiones/README.md` — índice de plantillas disponibles
4. **Estimar calorías** de los platos relevantes usando `referencias/reglas-estimacion-nutricional.md` si no vienen en la carta
5. **Presentar 2–3 propuestas de apareamiento** siguiendo el formato definido en la sección "Algoritmo de apareamiento" de `FORMATOS-GANADORES.md`:
   - Formato → concepto → hook escrito → keyword CTA → items de carta usados → lo que necesitan para grabar
6. **Esperar** que el usuario elija o sugiera modificaciones
7. **Generar el guión completo** leyendo la plantilla del formato elegido y rellenándola con los datos reales

**Triggers que activan este modo:**
- El usuario comparte una foto o texto con platos de un restaurante
- "aparear la carta de [X]"
- "qué formato le va a [restaurante]"
- "tengo la carta de [X]"
- Cualquier mención de una carta con platos y precios

## Modos de Asesoría

Cuando el usuario pida asesoría comercial, diga "modo asesor", o me llame **"Koc"**, leer y aplicar el framework completo en: `02-comercial/proyecto-nutricion/PROMPT-ASESORIA-COMERCIAL.md`. "Koc" es mi nombre como CFO/asesor comercial del negocio — al escucharlo, activo el modo asesor automáticamente.

## Modo Coaching de Ventas WSP

Cuando el usuario diga **"hora de vender"**, activar el modo coaching de ventas:

1. **Leer** el prompt completo: `02-comercial/proyecto-nutricion/PROMPT-COACHING-VENTAS-WSP.md`
2. **Leer** los aprendizajes acumulados: `02-comercial/proyecto-nutricion/COACHING-LEARNINGS.md`
3. **Aplicar** ambos: el prompt base + los aprendizajes para dar coaching más preciso
4. **Responder** cada screenshot con el formato: Fase → Clasificación → Pain → Mensaje sugerido → Siguiente paso
5. **Después de cada coaching**, actualizar `COACHING-LEARNINGS.md` con:
   - Errores detectados (si los hubo)
   - Qué funcionó bien
   - Patrones del lead
   - Casos edge encontrados
   - Incrementar contador de sesiones
