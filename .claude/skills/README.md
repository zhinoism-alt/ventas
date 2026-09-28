# Skills del proyecto

Claude Code carga todo lo que hay aquí en cada sesión sobre este repo. Viven en
el repo, y no en `~/.claude/skills`, porque las sesiones en la nube arrancan
en un contenedor nuevo y lo que no esté versionado se pierde.

Copiados tal cual de su origen el 2026-09-25 (para actualizar, volver a copiar):

| Skills | Origen | Commit | Licencia |
| --- | --- | --- | --- |
| frontend-design, webapp-testing, mcp-builder | github.com/anthropics/skills | 3337550 | la de cada carpeta |
| brainstorming, systematic-debugging, test-driven-development, writing-plans, executing-plans, … | github.com/obra/superpowers | 5bf4e78 | MIT (`LICENSE-superpowers`) |

De superpowers solo se copiaron las skills, no su hook de arranque, que obliga a
revisar las skills antes de cada respuesta. Sin él se activan por su
descripción, como cualquier otra.

## Plugins

Además de estas carpetas, `.claude/settings.json` activa 8 plugins del
marketplace `alirezarezvani/claude-skills` (engineering-skills, a11y-audit,
karpathy-coder, finance-skills, business-investment-advisor, linkedin,
business-growth-skills, roast). Esos no se copian aquí: Claude Code los
descarga del marketplace al abrir la sesión. Se eligieron 8 de 99 a propósito;
activar el marketplace entero mete ~388 skills que compiten por activarse.
