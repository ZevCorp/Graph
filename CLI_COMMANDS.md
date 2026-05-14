# CLI Commands - Graph Navigator

Guía rápida para usar Graph desde sus demos actuales.

Graph ya no está pensado solo para la demo médica. Hoy el sistema tiene:

- un core de aprendizaje y ejecución de workflows
- una capa de plugin/widget para páginas web
- separación de workflows por contexto de página
- personalidad del asistente configurable por página

## 1. Iniciar el servidor

```bash
node web/server.js
```

## 2. Abrir una superficie de aprendizaje

Puedes abrir cualquiera de estas páginas:

- `http://localhost:3000/`
- `http://localhost:3000/page1.html`
- `http://localhost:3000/page2.html`
- `http://localhost:3000/examples/car-demo`

## 3. Grabar un workflow

1. Abre la página donde quieres enseñar el flujo.
2. Usa el widget flotante del trainer.
3. Pulsa el botón de grabación.
4. Interactúa con la página:
   - clicks
   - inputs
   - textareas
   - selects
   - navegación
5. Detén la grabación.

Resultado:

- los pasos se guardan en Neo4j
- el workflow queda asociado al contexto de la página
- `WORKFLOWS.md` se regenera

## 4. Consultar workflows desde la CLI

```bash
node index.js
```

Luego:

```text
list
```

## 5. Ejecutar un workflow exacto por ID

```text
run wf_123
run wf_123 --input_2=test@example.com --input_3="Acme Inc"
```

Notas:

- `input_<stepOrder>` corresponde a variables inferidas desde pasos `input` o `select`
- si no envías una variable, se usa el valor grabado o el valor elegido por el sistema cuando aplica

## 6. Ejecutar con lenguaje natural

Desde el widget de chat del trainer, el usuario puede escribir una petición en lenguaje natural.

El sistema intentará:

1. filtrar workflows por el contexto actual de la página
2. elegir el mejor workflow para esa página
3. completar variables faltantes
4. ejecutar el workflow

## 7. Contexto y personalidad

Hoy el sistema ya soporta dos ideas importantes:

- contexto de página
  - los workflows aprendidos en medicina no deben mezclarse con carros
- personalidad del asistente
  - la demo médica usa un tono más neutral y clínico
  - la demo de carros usa un tono más cercano y comercial

## 8. Comandos técnicos

- `list`: muestra workflows disponibles
- `run <workflowId> --input_<stepOrder>=value`: ejecuta un workflow exacto
- `/<cypher>`: ejecuta Cypher directamente
- `exit`: cierra la CLI

## 9. Variables de entorno

- `OPENROUTER_API_KEY`: recomendado para resumen, matching y selects asistidos por LLM
- `OPENROUTER_MODEL`: opcional
- `OPENAI_API_KEY`: opcional como ruta alternativa
- `OPENAI_MODEL`: opcional
- `NEO4J_URI`
- `NEO4J_USER`
- `NEO4J_PASSWORD`
- `WEB_PORT`

## 10. Documentación relacionada

- [README.md](C:/Users/User/Desktop/Graph/README.md)
- [ARCHITECTURE.md](C:/Users/User/Desktop/Graph/ARCHITECTURE.md)
- [WORKFLOWS.md](C:/Users/User/Desktop/Graph/WORKFLOWS.md)
