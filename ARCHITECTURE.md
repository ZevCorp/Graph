# Architecture

This document explains the main architectural concepts behind Graph.

The most important idea is that Graph is being shaped as a reusable learning and replay system, not as a medical demo with some automation attached.

## System Goal

Graph learns workflows from real user interactions and later reuses them through an assistant-driven runtime.

The target product shape is a plugin-style architecture that can be attached to multiple page/app contexts while preserving the same learning core.

## Architectural Principles

### 1. The learning loop is the product

The critical path is:

1. record interaction
2. persist workflow
3. infer variables and options
4. regenerate workflow catalog
5. discover a workflow for the current context
6. replay it successfully

If a change weakens this loop, it is architectural debt.

### 2. Demos are integrations, not the core

The medical demo and the car-rental demo are examples that exercise the system.

They should not define the long-term boundaries of the product.

### 3. The plugin layer owns page-specific behavior

Anything that depends on a specific page or app should live in the page/plugin layer when possible:

- page form persistence
- assistant personality
- page context
- runtime widget injection

### 4. The core should stay generic

The core should not assume:

- EMR semantics
- car-rental semantics
- a specific frontend framework
- a single DOM structure

The core should think in terms of:

- workflows
- steps
- variables
- contexts
- execution

## Layered View

## 1. Core Domain and Application Layer

Primary responsibility:

- represent workflows
- choose workflows
- execute workflows
- preserve the learning loop

Key files:

- [src/domain/entities/Workflow.js](C:/Users/User/Desktop/Graph/src/domain/entities/Workflow.js)
- [src/domain/entities/Step.js](C:/Users/User/Desktop/Graph/src/domain/entities/Step.js)
- [src/application/use-cases/WorkflowLearner.js](C:/Users/User/Desktop/Graph/src/application/use-cases/WorkflowLearner.js)
- [src/application/use-cases/WorkflowCatalog.js](C:/Users/User/Desktop/Graph/src/application/use-cases/WorkflowCatalog.js)
- [src/application/use-cases/WorkflowExecutor.js](C:/Users/User/Desktop/Graph/src/application/use-cases/WorkflowExecutor.js)
- [src/application/use-cases/AgentChat.js](C:/Users/User/Desktop/Graph/src/application/use-cases/AgentChat.js)

Main responsibilities:

- create workflows and steps
- infer execution variables
- keep workflows discoverable
- choose a workflow from a user request
- execute workflows with provided or inferred values

### Workflow Entity

`Workflow` is the aggregate that ties together:

- human-readable purpose
- execution steps
- variable prompts
- page/application context

Today a workflow may carry:

- `id`
- `description`
- `summary`
- `status`
- `appId`
- `sourceUrl`
- `sourcePathname`
- `sourceTitle`
- `steps`

This context is essential for keeping workflows separated across demos and future plugin surfaces.

### Step Entity

`Step` is the execution primitive.

Today it models actions such as:

- `navigation`
- `click`
- `input`
- `select`

It also stores information that keeps replay explainable and robust:

- selector
- label
- value
- selected option
- allowed options
- step order

### Agent Chat

`AgentChat` is the workflow-selection layer.

It is responsible for:

- filtering workflows for the current page/app context
- injecting assistant personality into the prompt
- asking the LLM to choose a workflow and missing values

This is where page-specific personality affects the assistant's conversational behavior, but the workflow engine itself remains generic.

## 2. Infrastructure Layer

Primary responsibility:

- persist workflows
- talk to LLM provider
- run Playwright
- write generated catalog artifacts

Key files:

- [src/infrastructure/repositories/Neo4jWorkflowRepository.js](C:/Users/User/Desktop/Graph/src/infrastructure/repositories/Neo4jWorkflowRepository.js)
- [src/infrastructure/LLMProvider.js](C:/Users/User/Desktop/Graph/src/infrastructure/LLMProvider.js)
- [src/infrastructure/PlaywrightRunner.js](C:/Users/User/Desktop/Graph/src/infrastructure/PlaywrightRunner.js)
- [src/infrastructure/file-system/MarkdownCatalogWriter.js](C:/Users/User/Desktop/Graph/src/infrastructure/file-system/MarkdownCatalogWriter.js)

### Neo4j Repository

Neo4j is the persistence layer for workflows and steps.

It stores:

- workflow metadata
- workflow context
- step sequence
- select metadata

This layer should stay storage-focused and not absorb product behavior.

### LLM Provider

The LLM provider is intentionally isolated from application logic.

Its responsibilities are:

- transport
- model selection
- JSON-response handling
- provider-specific auth/config

Today it is configured primarily for OpenRouter, with fallback support patterns for OpenAI-style usage.

### Playwright Runner

The Playwright runner executes workflows against the browser.

Important current capabilities:

- locator resolution
- input filling
- select-option application
- LLM-assisted selection of empty visible `select` elements when needed

This layer should remain execution-oriented, not decision-oriented. Decision-making should stay in application logic or the LLM prompt layer.

## 3. Page Plugin Layer

Primary responsibility:

- connect the generic learning system to a specific page

Key files:

- [web/public/recorder.js](C:/Users/User/Desktop/Graph/web/public/recorder.js)
- [web/public/assistant-runtime.js](C:/Users/User/Desktop/Graph/web/public/assistant-runtime.js)
- [web/public/trainer-plugin.js](C:/Users/User/Desktop/Graph/web/public/trainer-plugin.js)
- [web/public/page-state.js](C:/Users/User/Desktop/Graph/web/public/page-state.js)

This is the most important architectural evolution in the repo.

Originally, a lot of page behavior lived directly in the medical demo.

Now there is a generic plugin-style layer that owns:

- floating assistant runtime
- floating trainer UI
- workflow start/stop triggers
- agent chat request wiring
- page context propagation
- page-level assistant personality
- generic page-state persistence

### Floating Assistant Runtime

`assistant-runtime.js` is the new reusable UI core for the plugin.

Its responsibility is not workflow learning itself. Its job is to be the visual and conversational body of the product inside any page:

- render the floating assistant
- move toward active fields or controls
- spotlight page regions during guided tours
- expose a stable runtime API that other subsystems can call

This matters because multiple future systems need the same surface:

- workflow execution guidance
- pitch/improvement tours
- real-time assistant conversation
- future memory capture and omnichannel CRM actions

By keeping that body separate from `trainer-plugin.js`, we avoid turning the trainer toolbar into the entire product runtime.

### Recorder

The recorder captures DOM actions with enough semantic structure to replay them later.

It is intentionally moving away from demo-specific assumptions.

Current responsibilities:

- capture clicks
- capture text entry
- capture select changes
- attach labels and selector metadata
- send steps to the backend

### Trainer Plugin

The trainer plugin is the runtime mount point for page-specific behavior.

It is configured per page with values like:

- `appId`
- `workflowDescription`
- `assistantProfile`

This design is the current bridge toward a future real plugin.

After the floating assistant split, `trainer-plugin.js` should increasingly become orchestration glue:

- mount page-scoped configuration
- connect UI controls to backend APIs
- pass context into the assistant runtime
- trigger tours and workflow execution

It should not become the permanent home for voice, memory, CRM sync, or execution telemetry logic.

### Page State

`page-state.js` is a generic local form persistence helper.

It replaced the older, more demo-specific `EMRState` idea with a reusable mechanism keyed by `storageKey`.

## 4. Demo and Integration Layer

Primary responsibility:

- exercise the system in realistic scenarios

Current surfaces:

- medical demo pages
- injected car-rental demo

### Medical Demo

Files:

- [web/public/index.html](C:/Users/User/Desktop/Graph/web/public/index.html)
- [web/public/page1.html](C:/Users/User/Desktop/Graph/web/public/page1.html)
- [web/public/page2.html](C:/Users/User/Desktop/Graph/web/public/page2.html)

Characteristics:

- uses `appId: medical-demo`
- mounts the generic trainer plugin
- supplies a neutral assistant profile

### Car Demo

Served from:

- `http://localhost:3000/examples/car-demo`

Source material:

- [Demo de carros/Alquiler de Carros en Medellín _ Rent a Car Medellín 24h.html](<C:/Users/User/Desktop/Graph/Demo de carros/Alquiler de Carros en Medellín _ Rent a Car Medellín 24h.html>)

Characteristics:

- uses `appId: car-demo`
- trainer is injected from the server
- assistant profile is sales-oriented and more human/casual

## Runtime Flow

The current runtime can be described as:

```text
Page/App
  -> Assistant Runtime
  -> Trainer Plugin
    -> Recorder
      -> API
        -> WorkflowLearner
          -> Neo4j
            -> Catalog regeneration

User message
  -> Trainer Plugin chat
    -> API
      -> AgentChat
        -> context filter
        -> personality-aware prompt
        -> workflow decision
          -> WorkflowExecutor
            -> PlaywrightRunner
              -> Assistant Runtime automation events

Pitch generation
  -> Trainer Plugin
    -> GeneratePitchArtifacts
      -> pitchpersonality.md
      -> future-improvement.md
      -> improvement-tour.json
        -> Assistant Runtime guided tour
```

## Context and Personality

Two newer architectural features matter a lot:

### Page Context

Workflows are associated with the page/app where they were learned.

This prevents cross-demo pollution.

Today the main context discriminator is `appId`.

### Assistant Personality

Assistant personality is configured at the plugin layer and passed into the agent decision flow.

That means:

- personality is page-level
- personality is not hardcoded globally
- different demos can feel different without forking the workflow engine

This is the right shape for future plugin work, where each mounted surface can provide its own conversational style.

## Why This Architecture Matters

This architecture is the simplest form that still supports future growth.

It gives us:

- a generic learning core
- a reusable page integration layer
- context-aware workflow separation
- page-specific assistant behavior
- the ability to add new demos without rewriting the engine

## Current Limits

The architecture is intentionally still incomplete.

Not yet solved at a mature level:

- workflow segmentation into reusable sub-blocks
- robust ranking among many similar workflows in the same page
- packaging as a true browser plugin/extension
- Electron-specific adapters
- framework-specific edge cases like shadow DOM or highly dynamic SPA transitions

## Recommended Direction

Near-term work should continue to strengthen:

1. the generic plugin layer
2. context-aware workflow discovery
3. page-ready DOM surfaces with stable selectors
4. assistant-runtime APIs that other product capabilities can reuse

and avoid pushing product logic back into demo-specific files when a generic extension point exists.
