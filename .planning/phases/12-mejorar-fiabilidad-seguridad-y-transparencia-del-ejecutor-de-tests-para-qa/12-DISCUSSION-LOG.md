# Phase 12: mejorar-fiabilidad-seguridad-y-transparencia-del-ejecutor-de-tests-para-qa - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 12-mejorar-fiabilidad-seguridad-y-transparencia-del-ejecutor-de-tests-para-qa
**Areas discussed:** Assertion safety, Evidence granularity, Blocking vs degraded execution, Run config reproducibility

---

## Assertion Safety

| Option | Description | Selected |
|--------|-------------|----------|
| A | Replace dynamic assertion execution with a strict allowlisted runner | ✓ |
| B | Keep dynamic execution, but sandbox it harder and restrict globals | |
| C | Keep current flexibility and document the risk | |

**User's choice:** A
**Notes:** Safety wins over flexibility. Unsupported translated assertions should not execute arbitrary code.

---

## Evidence Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| A | Persist one real screenshot per completed step only | |
| B | Persist step screenshot plus per-tool-call trace metadata and any available real screenshot references | ✓ |
| C | Add optional video/session artifacts too, with screenshot still default | |

**User's choice:** B
**Notes:** QA needs a durable, inspectable audit trail beyond a single final step screenshot.

---

## Blocking vs Degraded Execution

| Option | Description | Selected |
|--------|-------------|----------|
| A | Fail closed whenever audit prerequisites are unsafe or incomplete | |
| B | Allow degraded runs, but label them explicitly as degraded or non-auditable in UI/history/exports | ✓ |
| C | Stay permissive; warnings in logs/UI are enough | |

**User's choice:** B
**Notes:** The system may continue when possible, but trust level must be explicit and durable.

---

## Run Config Reproducibility

| Option | Description | Selected |
|--------|-------------|----------|
| A | Keep env-driven config only | |
| B | Expose provider, orchestrator model, and auditor models in UI/CLI and persist them with the run | ✓ |
| C | Use env defaults but allow overrides, always persisting resolved values | |

**User's choice:** B
**Notes:** QA runs should be reproducible from stored run metadata, not reconstructed from ambient environment state.

---

## the agent's Discretion

- Exact naming and shape of the degraded/non-auditable trust-state metadata
- Exact schema used to persist per-tool-call evidence

## Deferred Ideas

- Optional video or richer session replay artifacts as a later enhancement
- Broader run analytics beyond executor trust hardening
