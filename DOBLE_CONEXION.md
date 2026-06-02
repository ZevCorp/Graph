# Doble conexión — login + nota por paciente en tiempo real

Permite iniciar sesión con Google y que la **hoja clínica se sincronice en vivo**
entre todos los dispositivos conectados con la misma cuenta. El médico llena la
nota en el PC (tecleando o por voz) y se refleja al instante en otro dispositivo;
la nota queda guardada por paciente/encuentro.

## Cómo funciona (resumen)

- **Identidad:** Supabase Auth con Google (login del lado del navegador).
- **Nota durable:** tabla `encounters` en Postgres; la nota es la columna `note`
  (`jsonb`), un mapa plano `{ idDelCampo: valor }`. RLS: cada usuario solo ve lo suyo.
- **Tiempo real:** canal *Broadcast* de Supabase por encuentro (`encounter:<id>`)
  para reflejar campo‑a‑campo al instante + un *upsert* con debounce de la nota
  completa para durabilidad.
- **Integración:** todo cuelga de `web/public/page-state.js` (el único punto por
  donde pasa el estado del formulario). Como los llenados por voz también disparan
  `input`/`change`, **se reflejan automáticamente**, sin tocar la lógica de voz.

El pipeline de voz/teléfono‑como‑micrófono **no cambia**.

## Archivos

- `web/public/supabase-client.js` — carga el SDK y crea el cliente (`window.MiracleSupabase`).
- `web/public/auth-gate.js` — muro de login con Google (`window.MiracleAuth`).
- `web/public/note-sync.js` — espejo en tiempo real sobre `PageState` (`window.MiracleNoteSync`).
- `web/public/page-state.js` — hooks añadidos: `applyRemoteField`, `applyRemoteState`, `getState`, `onFieldChange`.
- `web/server.js` — endpoint `GET /api/public-config` (sirve la config pública de Supabase desde `.env`).
- Cableado por ahora solo en `web/public/emr-workspace.html`.

## Puesta en marcha

### 1. Variables de entorno
Ya quedaron en `.env` (gitignored):
```
SUPABASE_URL=https://nzccbfccuvyfxujymizr.supabase.co
SUPABASE_ANON_KEY=sb_publishable_WbzIYqYVYGzjNWru2sfgCA_WzqH5EDb
```
⚠️ Reemplaza también `NEO4J_*` y `OPENAI_API_KEY` con tus valores reales (el
servidor no arranca sin `NEO4J_URI`).

### 2. Configurar Google como proveedor (manual — solo tú puedes)
1. **Google Cloud Console** → *APIs & Services* → *Credentials* → *Create
   credentials* → *OAuth client ID* → tipo **Web application**.
   - *Authorized redirect URI*:
     `https://nzccbfccuvyfxujymizr.supabase.co/auth/v1/callback`
   - Copia el **Client ID** y el **Client Secret**.
2. **Supabase dashboard** (proyecto *miracle*) → *Authentication* → *Sign In /
   Providers* → **Google** → activar y pegar Client ID + Secret → guardar.
3. **Supabase dashboard** → *Authentication* → *URL Configuration*:
   - *Site URL*: `http://localhost:3000`
   - *Redirect URLs* (añade ambas): `http://localhost:3000/**` y la de tu red
     local, p. ej. `http://192.168.1.50:3000/**` (para abrirlo desde el teléfono).

### 3. Levantar
```
npm start
```
Abre `http://localhost:3000/emr-workspace.html`.

## Probar el espejo en vivo

1. En el **dispositivo A** abre `emr-workspace.html` → inicia sesión con Google.
   Se crea un encuentro y la URL pasa a `...emr-workspace.html?encounter=<id>`.
   Abajo a la izquierda aparece un chip “🟢 Sincronizado” con **Copiar enlace**.
2. Copia ese enlace y ábrelo en el **dispositivo B** (mismo Google). Verás el
   mismo `?encounter=<id>`.
3. Escribe en un campo en A → aparece en B en ~1 s. Prueba también por **voz**
   (teléfono como micrófono apuntando a A): la nota se llena y B la refleja.
4. Recarga B → la nota se rehidrata desde Supabase (durabilidad).
5. Con **otra** cuenta de Google, ese encuentro no es visible (RLS).

## Notas de seguridad
- El nombre del canal incluye el UUID del encuentro (no adivinable). Para
  endurecer, se puede pasar a canales *privados* con políticas en `realtime.messages`.
- En el cliente solo va la **publishable key**, nunca la service key.
- Para uso clínico real: revisar región de datos, retención y cifrado. Esto es un
  prototipo en la rama `feature/doble-conexion`.

## Pendiente (seguimiento)
- Cablear también `index.html` / `page1.html` / `page2.html` (hoy solo `emr-workspace.html`).
- Selector de pacientes/encuentros (hoy se crea/uno por URL).
- Teléfono como EMR completo (hoy: teléfono micro + PC espejo).
