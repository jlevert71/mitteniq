# MittenIQ Documentation Index

This file explains the purpose and reading order of repository documentation.

All AI assistants and developers should consult this file before using the documentation system.

---

# Documentation Reading Order

To understand the system safely, read documentation in the following order:

1. BUILD_STATE_SNAPSHOT.md

   * Current system status
   * Active features
   * Current development stage

2. ARCHITECTURE.md

   * System architecture
   * Major subsystems
   * Data flow

3. REPO_MAP.md

   * Folder layout
   * Responsibility of each directory

4. DECISIONS.md

   * Architectural decisions
   * Constraints that must not be violated

5. CONVENTIONS.md

   * Coding workflow
   * development practices

6. GUARDRAILS.md

   * Critical system protections
   * areas that must not be modified casually

 Architecture — Three-layer document intelligence model
Intake Validation Log — real project validation results
Known Issues — PDF extraction limitations  

---

# Operational Documents

These documents support day-to-day development.

ROADMAP.md
Long-term product direction.

TASK_QUEUE.md
Immediate tasks to be completed.

KNOWN_ISSUES.md
Known bugs and technical debt.

CHANGELOG.md
History of major changes.

---

# Session Management

RESUME_PROMPT.md
Used to resume development sessions with AI assistants.

SESSION_PROTOCOL.md (if present)
Rules for safe incremental development.

---

# Documentation Philosophy

MittenIQ uses **documentation-first development**.

Rules:

1. Documentation reflects the intended architecture.
2. BUILD_STATE_SNAPSHOT.md reflects the **actual system state**.
3. When code and documentation disagree, update documentation immediately.

Documentation should be kept concise and accurate so that new development sessions can resume safely.
