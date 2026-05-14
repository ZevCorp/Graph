# future-improvement.md

## Future Implementation Backlog
This file tracks the capabilities intentionally left out of the first floating-assistant release.

## Phase 2: Real-Time Conversation Core
- Add real-time voice output so the floating assistant can narrate tours and explain actions while workflows run.
- Add real-time speech input so the assistant can ask for missing information and listen naturally.
- Add assistant-driven function calling in real time, letting the conversation itself decide when to query memory, trigger workflows, or request clarification.

## Phase 3: User Memory And Experience Timeline
- Capture user answers, hesitation points, repeated questions, and accepted recommendations as structured memory.
- Maintain a page-level and user-level interaction timeline that improves future decisions.
- Distinguish between ephemeral session facts and durable profile facts before storing them long term.
- Track business pain points, objections, and missed expectations expressed during assistant conversations.
- Track opportunity signals such as high purchase intent, urgency, upsell cues, trust triggers, and unanswered commercial interest.

## Phase 3.5: Real-Time Voice Business Intelligence
- Let the real-time assistant talk with users through voice while they navigate the page.
- Extract valuable business insight in real time from those voice conversations without breaking the natural flow.
- Separate pain-point evidence from opportunity evidence so the system can highlight both what blocks conversion and what accelerates it.
- Tie each insight to page sections, workflow moments, and conversation turns so future recommendations are grounded in real interaction evidence.

## Phase 4: Omnichannel CRM Sync
- Continuously sync high-value user data and conversation outcomes into HubSpot or another CRM.
- Track consent, source attribution, and field ownership before writing commercial profile data.
- Use CRM updates to personalize future on-site conversations and off-site follow-up.

## Phase 5: Learning And Content Generation
- Regenerate `pitchpersonality.md` from real behavioral evidence, not only recorded workflows.
- Detect friction patterns and produce page-improvement recommendations tied to real selectors and page sections.
- Add smarter journey segmentation so the assistant can decide between sales, onboarding, support, and recovery modes.

## Planned Input Sources
- Real assistant conversations with users
- Real-time voice conversations between the assistant and page visitors
- Field completion patterns across the page
- Repeated hesitation points, drop-offs, and recovery paths
- Sections where users need too many clarifications before continuing
- Commercial objections, intent cues, and opportunity signals discovered during the conversation

## Planned Result
The system will regenerate and refine `pitchpersonality.md` from real behavioral evidence, so each workflow segment learns how to ask for the right information at the right moment with less friction.
The same evidence will also feed future page-improvement suggestions based on real user pain points and real opportunity signals, not only internal heuristics.

## Continuous Improvement Vision
This will be the start of a continuous improvement system to solve web page design issues based on real user behavior.
The long-term goal is not only to improve the assistant pitch, but also to reveal where the page structure, copy, field order, or interaction model should change.

## Current Context
- appId: car-demo
- sourcePathname: /rentacar/reservar.html
- generatedAt: 2026-05-14T05:52:52.769Z
