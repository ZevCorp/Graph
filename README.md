# Graph

Graph is a workflow learning and replay engine for web applications.

It watches a user interact with a page, stores the workflow as structured steps, and later lets an assistant choose and execute the right workflow with Playwright.

The long-term direction is not a single demo app. The product direction is a reusable plugin-style system that can be mounted on different surfaces:

- static HTML pages
- React apps
- WordPress sites
- Shopify sites
- Electron apps

The medical demo and the car-rental demo are currently proving grounds for the learning loop.

## Core Idea

Graph closes this loop:

1. A user performs actions in a page.
2. The recorder captures those actions as structured steps.
3. The workflow is persisted in Neo4j.
4. A catalog is regenerated for discovery and execution.
5. An assistant chooses the right workflow for the current page context.
6. Playwright replays the workflow and fills missing values.

## Architecture

The codebase is moving toward three layers:

1. Learning and execution core
   - workflow entities
   - workflow catalog
   - workflow selection
   - Playwright execution
   - Neo4j persistence

2. Page plugin layer
   - recorder
   - floating trainer widget
   - page-scoped persistence
   - page context and assistant personality

3. Demo and integration surfaces
   - medical demo
   - car-rental demo
   - future plugin entrypoints for external pages/apps

For a deeper explanation, see [ARCHITECTURE.md](C:/Users/User/Desktop/Graph/ARCHITECTURE.md).

## Main Runtime Pieces

- [web/server.js](C:/Users/User/Desktop/Graph/web/server.js)
  - Express server
  - serves demo pages
  - exposes workflow and agent APIs
  - injects the trainer into the car demo

- [web/public/recorder.js](C:/Users/User/Desktop/Graph/web/public/recorder.js)
  - generic DOM action recorder
  - captures `navigation`, `click`, `input`, and `select`

- [web/public/trainer-plugin.js](C:/Users/User/Desktop/Graph/web/public/trainer-plugin.js)
  - floating trainer widget
  - workflow recording controls
  - agent chat entrypoint
  - page context and assistant personality wiring

- [web/public/assistant-runtime.js](C:/Users/User/Desktop/Graph/web/public/assistant-runtime.js)
  - reusable floating assistant body
  - guided spotlight and page-tour runtime
  - execution telemetry surface for Playwright and future voice/memory features

- [web/public/page-state.js](C:/Users/User/Desktop/Graph/web/public/page-state.js)
  - generic page form-state persistence

- [src/application/use-cases/AgentChat.js](C:/Users/User/Desktop/Graph/src/application/use-cases/AgentChat.js)
  - workflow selection
  - page-context filtering
  - assistant personality prompt shaping

- [src/application/use-cases/WorkflowExecutor.js](C:/Users/User/Desktop/Graph/src/application/use-cases/WorkflowExecutor.js)
  - workflow replay with Playwright
  - select-option choice handling via LLM

- [src/infrastructure/LLMProvider.js](C:/Users/User/Desktop/Graph/src/infrastructure/LLMProvider.js)
  - LLM transport
  - currently supports OpenRouter-first configuration

## Demos

### Medical Demo

Pages:

- [web/public/index.html](C:/Users/User/Desktop/Graph/web/public/index.html)
- [web/public/page1.html](C:/Users/User/Desktop/Graph/web/public/page1.html)
- [web/public/page2.html](C:/Users/User/Desktop/Graph/web/public/page2.html)

Characteristics:

- uses `appId: medical-demo`
- mounts the generic trainer plugin
- uses a neutral, professional assistant profile

### Car Demo

Entry URL:

- `http://localhost:3000/examples/car-demo`

Source HTML:

- [Demo de carros/Alquiler de Carros en Medellín _ Rent a Car Medellín 24h.html](<C:/Users/User/Desktop/Graph/Demo de carros/Alquiler de Carros en Medellín _ Rent a Car Medellín 24h.html>)

Characteristics:

- uses `appId: car-demo`
- trainer is injected at runtime from the server
- assistant profile is configured as a close, sincere, human car-rental advisor

## Context-Aware Workflows

Workflows are no longer treated as globally interchangeable.

Each learned workflow can store page/application context such as:

- `appId`
- `sourceUrl`
- `sourcePathname`
- `sourceTitle`

This lets the assistant avoid using a medical workflow while chatting from the car-rental page.

## Assistant Personality

Assistant personality is part of the page plugin configuration.

Today the differentiator is the page where the plugin runs:

- medical pages use a clinical, concise profile
- car pages use a closer, sales-oriented profile

This is passed through the page plugin into the agent selection prompt.

## Running the Repo

1. Install dependencies:

```bash
npm ci
```

2. Start the web server:

```bash
node web/server.js
```

3. Open one of the demos:

- `http://localhost:3000/`
- `http://localhost:3000/page1.html`
- `http://localhost:3000/page2.html`
- `http://localhost:3000/examples/car-demo`

## Environment Variables

Main environment variables used today:

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL` (optional)
- `OPENAI_API_KEY` (optional fallback path)
- `OPENAI_MODEL` (optional)
- `NEO4J_URI`
- `NEO4J_USER`
- `NEO4J_PASSWORD`
- `WEB_PORT`

## Current State

The system already supports:

- learning workflows from user actions
- persisting workflows in Neo4j
- catalog regeneration
- replay with Playwright
- select choice assistance through the LLM
- page-context filtering
- per-page assistant personality
- a reusable floating assistant runtime for guided movement on the page
- generation of `improvement-tour.json` alongside pitch artifacts

Still intentionally incomplete:

- segmenting workflows into reusable sub-blocks
- advanced ranking among many similar workflows on the same page
- production-grade packaging as a browser/Electron plugin
- adapters for frameworks beyond the current demos
- real-time voice input/output
- assistant-managed long-term memory and CRM sync
