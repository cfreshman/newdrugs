# Wayfinder study

Started: 2026-09-25 00:47 UTC. Initial study completed: 01:50 UTC. Reference inspection continues before each related implementation.

This records the study of the current Wayfinder working tree and its live MCP contracts. The initial study is complete; implementation now follows the findings in `../new-drugs-direction.md`. Explicit visual corrections were handled during the study. The purpose is to identify transferable behavior, not to copy Wayfinder's business product or invent new social-product rules.

Scope clarification: no Wayfinder product source has been edited. Existing Wayfinder suites were run as reference checks; they are not new-drugs tests. No further test runs will be launched in Wayfinder. All port implementation and its validation belong in new drugs. At this point, new drugs has TypeScript checks only, with no equivalent behavioral-test coverage yet.

Updated direction at 01:13 UTC: also study `/Users/work/dev/pangaea` for Twitter-like interaction and UI inspiration. New drugs is a distinct product. Do not directly port code or UI from either reference. The user normally returns to chat but can trigger other task-specific interfaces. References establish useful behavior and lessons; the new implementation must be designed for this app.

## What the user has actually specified

- New drugs is an agent-operated social app, initially a circle, a textarea, and messages on a colorful radial-gradient background.
- The circle moves the whole chat. When available message space shrinks, the newest messages stay at the bottom of the scroll area.
- Ordinary AI-chat bubbles and readable, substantial controls; no editorial or wellness-app presentation.
- A blue 3D idle orb and blue user bubbles. Dictation splits into closely joined red cancel and green send orbs. Both clear dictation; no competing manual-send button during dictation. No rings.
- No input placeholder, visible scrollbar, or top gap. Bound the left and right extents, especially on mobile. Less space between input and orb; no literal bridge between buttons.
- Phosphor icons. Google Noto Sans, Noto Serif, and Noto Sans Mono. Extensive CSS variables. Intentional focus treatment rather than automatic outlines.
- Credits at actual cost; external CLI/MCP use is free. No invented margin. The web app is mobile first; a native mobile app can follow.
- Profiles are authored by people, including their text and images. The AI must not generate or edit that identity for them. Account creation leads directly into profile creation.
- Vite/MERN on a single DigitalOcean host is familiar; infrastructure remains a choice to justify, not a reason to transplant Convex wholesale.
- Local ports: web 7330, API 7331, MongoDB 7332.
- Transfer Wayfinder's serious agent behavior: web search, uploads, enforced consequential-write confirmation, grouped confirmation, real progress, and continuation through user interactions.
- Avoid browser automation unless strictly necessary.

## First findings, verified in source

1. **The in-app agent is a client of the real MCP.** `convex/agentRuntime/agentTools.ts:createRuntimeAgent` connects to `/mcp/agent`, reads the global instruction resource and current operation index, and derives identity from the runtime context. It does not maintain a second handpicked set of business implementations.
2. **The host controls writes.** The in-app wrapper blocks raw MCP execute, wraps it with SDK approval interruptions, supplies idempotency, binds exact arguments and versions, checks policy, and records the resulting audit/verification state.
3. **An interruption is not necessarily a human confirmation.** All valid writes pass through a saved checkpoint. Catalog-confirmed consequences wait for the user. Ordinary permitted reversible actions are approved by host policy and continue without a redundant question.
4. **The conversation outlives the request.** Submission creates a durable user turn and queued run. A scheduler claims the run. SDK state, usage, decisions, and message drafts are persisted. Waiting for approval releases the current worker; later approval restores the same saved execution.
5. **Work is not limited to a toy loop.** The shared limits permit substantial work and bounded write concurrency. Execution windows checkpoint and resume. Limits on bytes, concurrency, authority, and spend do the safety work; an arbitrary handful of model turns does not.
6. **Visible thinking is task progress.** Commentary-phase preambles are separate from final-answer text. Tool activity reports discovery, reading, preparing, and verifying. The instructions explicitly avoid generic preambles and exposing hidden reasoning.
7. **Uploads and navigation have different semantics.** Navigation has explicit continuation behavior and is tied to the originating browser session. Upload cards return verified file handles through a new user turn. A generic `{open: 'profile'}` result is not an equivalent continuation mechanism.

## Live MCP contracts inspected

- `context.recommended.get`: direct operations are the normal path for capable external assistants; Wayfinder-hosted AI is optional and separately billable.
- `crm.contact.update`: a reversible edit has no human-confirmation requirement; full-input idempotency and declared read-back verification still apply.
- `agent.team_message.send`: confirmation binds exact recipients, content, and reply target; proof is host attestation, with expiry.
- `crm.deal.bulk.delete.prepare` / `.execute`: exact IDs, material preview, selection digest, drift refusal, per-item outcomes, and verification.
- `agent.thread.get`: thread identity, active run, explicit run status and phase, waiting approvals, failure state.
- `agent.thread.wake`: resumes the same saved run once and preserves normal approval requirements.
- `billing.credit_purchase.continue`: typed browser continuation, no card data in the model, and a named completion read.
- `crm.import.analyze.continue`: typed import intent; local file bytes do not pass through MCP arguments.
- `settings.discover`: discover actual accessible settings and exact operations instead of guessing UI requirements.

## Questions being traced next

- Exactly when an optimistic message and composer draft reconcile with server acknowledgement.
- Approval persistence, automatic versus human decisions, stale-state rejection, partial rejection, and cancellation.
- File verification, ownership, reference retention, upload completion, and automatic re-entry.
- Streaming flush and final-message ownership across disconnects and errors.
- Cost checkpointing, duplicate usage protection, and external-versus-hosted billing boundaries.
- Which invariants transfer cleanly to MongoDB, and which mechanisms must change with the infrastructure.

## Current implementation failures to assess

The current new-drugs implementation is not yet a Wayfinder port. It has a short Responses loop, direct custom tools, prompt-only write confirmation, no durable paused execution, no web search, no working attachment path, and generic panel-opening without completion state. Its profile and posting prerequisites were invented during implementation. They must be reconsidered from the user's product intent rather than silently removed or elaborated in response to an error message.

This document records findings while reading. It is not a declaration that any missing behavior has been implemented or tested.
