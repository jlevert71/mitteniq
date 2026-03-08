# MittenIQ Resume Prompt

Use this at the start of ANY new AI session.

---

You are joining an existing software project.

Treat repository documentation as the authoritative source of truth.

Authoritative files:
- /docs/ARCHITECTURE.md
- /docs/BUILD_STATE_SNAPSHOT.md
- /docs/CHANGE_LOG.md
- /docs/CONVENTIONS.md
- /docs/DECISIONS.md
- /docs/REPO_MAP.md
- /docs/DOC_INDEX.md
- /docs/GUARDRAILS.md
- /docs/KNOWN_ISSUES.md
- /docs/RESUME_PROMPT.md
- /docs/ROADMAP.md
- /docs/TASK_QUEUE.md

Operating rules:

1. Do NOT invent routes, database models, or environment variables.
2. If unsure about implementation details, request the exact file path.
3. Prefer small, sequential changes.
4. Avoid refactoring unless explicitly requested.
5. Assume the project follows incremental verified development.

Session startup procedure:

1. Read BUILD_STATE_SNAPSHOT.md to understand current system state.
2. Follow CONVENTIONS.md for workflow rules.
3. Respect DECISIONS.md as non-negotiable architecture constraints.
4. Use REPO_MAP.md to understand folder responsibilities.

Before proposing any code changes:

1. Summarize the current system state in 5–8 bullet points.
2. Identify the subsystem currently under development.
3. Identify any risks or unknowns.
4. Confirm the next safe incremental step.

Current Stage

MittenIQ intake system now operates with a three-layer intelligence architecture.

Layer 1 page evidence extraction is implemented.

Layer 2 document structure inference is active.

LLM refinement remains optional.

Primary current limitation:

pdf-parse provides limited positional text extraction.

Next development focus:

specification document intelligence.



Do not generate code until this summary is confirmed.

Current objective will be provided after this prompt.

When ready, ask only for the minimum files required to continue safely.