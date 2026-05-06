# CLI Commands - Graph Navigator (Agentic)

Sistema para grabar navegaciones web como "Workflows" en Neo4j y ejecutarlos mediante un LLM (OpenRouter/Nemotron).

## 1. Grabar Workflows
1. Inicia el servidor web: `node web/server.js`
2. Abre `http://localhost:3000`
3. Escribe una descripción y dale a **Start Recording**.
4. Navega por las páginas y escribe explicaciones en el cuadro de texto, pulsando **Log Current Step** en cada paso.
5. Pulsa **Stop & Save** al terminar. Esto actualizará `WORKFLOWS.md`.

## 2. Ejecutar Workflows via CLI
1. Inicia el CLI: `node index.js`
2. Pide al LLM que ejecute un workflow en lenguaje natural:
   - `Ejecuta el workflow de registro de usuario`
   - `Navega por la página 1 y 2`
3. El sistema usará **Nemotron 3 Omni Nano** para identificar el ID del workflow y lo ejecutará usando **Playwright**.

## 3. Comandos Técnicos
- `/MATCH (n) RETURN n`: Ejecuta Cypher directamente.
- `exit`: Cierra la aplicación.

## Configuración (.env)
- `OPENROUTER_API_KEY`: Tu llave de OpenRouter.
- `NEO4J_URI/USER/PASSWORD`: Datos de tu base de datos Neo4j.
