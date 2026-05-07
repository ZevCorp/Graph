# CLI Commands - Graph Navigator

Sistema mínimo para grabar acciones reales del DOM, guardarlas como workflows y reejecutarlas con Playwright.

## 1. Grabar un workflow
1. Inicia el servidor web: `node web/server.js`
2. Abre `http://localhost:3000`
3. Escribe el propósito del workflow y pulsa **Start Recording**
4. Interactúa con la app de demo:
   - clicks en botones o links
   - inputs o textareas
   - navegación entre páginas
5. Si quieres, añade una explicación breve antes de la siguiente acción
6. Pulsa **Stop & Save**

Resultado:
- los pasos se guardan en Neo4j con `actionType`, `selector`, `value`, `url` y `stepOrder`
- `WORKFLOWS.md` se regenera con resumen, variables detectadas y comando CLI sugerido

## 2. Consultar workflows
1. Inicia la CLI: `node index.js`
2. Ejecuta `list`

## 3. Ejecutar un workflow por ID
1. Inicia la CLI: `node index.js`
2. Ejecuta:
   - `run wf_123`
   - `run wf_123 --input_2=test@example.com --input_3="Acme Inc"`

Notas:
- `input_<stepOrder>` corresponde a pasos grabados de tipo `input`
- si no envías una variable, se usa el valor grabado originalmente

## 4. Ejecutar con lenguaje natural
También puedes escribir una petición en lenguaje natural y el LLM intentará elegir el workflow correcto.

## 5. Comandos técnicos
- `list`: muestra workflows disponibles
- `run <workflowId> --input_<stepOrder>=value`: ejecuta un workflow exacto
- `/<cypher>`: ejecuta Cypher directamente
- `exit`: cierra la CLI

## Configuración
- `OPENROUTER_API_KEY`: opcional para resumen y matching por LLM
- `NEO4J_URI`: URI de Neo4j
- `NEO4J_USER`: usuario
- `NEO4J_PASSWORD`: contraseña
