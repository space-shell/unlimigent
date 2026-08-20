# unlimigent — MVP stages and status

Strict MVP. The user journey is the product; each stage proves one more kilometre of
that journey on the physical device. Everything else is post-MVP.

- Current phase: **Planning** (pre-Stage 0)
- Process: trunk-based, feature-flagged. Each stage = one or more flags; a stage is
  complete when its flag defaults on across a clean main build on the device. Main
  always shippable.

## Stage table

| Stage | Flag | Focus | Status |
|---|---|---|---|
| 0 | `stage0` | Foundations & spikes | ☐ not started |
| 1 | `stage1` | Graph core & input model | ☐ not started |
| 2 | `stage2` | Canvas & touch navigation | ☐ not started |
| 3 | `stage3` | Gamepad & game UX | ☐ not started |
| 4 | `stage4` | Live Paseo mirror | ☐ not started |
| 5 | `stage5` | Voice & hands-free | ☐ not started |
| 6 | `stage6` | Journey polish & PWA | ☐ not started |

## Stage 0 — Foundations & spikes

De-risk assumptions before they are load-bearing.

- Scaffold: flake.nix devshell (nodejs 22+), Vite + React + TS + `vite-plugin-pwa`,
  R3F/drei, lint/format config.
- Feature-flag module: typed flags object, persisted in settings, gating UI entry
  points.
- Spikes (findings logged below):
  - **0a** Paseo event surface: connect `@getpaseo/client` to the live daemon;
    enumerate event granularity (agents, workspaces/worktrees, schedules,
    permissions, MCP tool-call visibility). Output: verified `PaseoGateway`
    interface.
  - **0b** HTML-in-canvas on device: WICG demos on the pad (Cromite) + desktop;
    record flag/trial availability. Determines the `HTMLTexture` slot.
  - **0c** STT engine: Web Speech API availability on Cromite (likely absent —
    Google services stripped); whisper.cpp WASM model size/latency on the pad; cloud
    fallback. Determines the speech stack for Stage 5.
  - **0d** Pages-origin → local daemon: HTTPS origin connecting to `ws://localhost`
    (mixed content + Private Network Access behavior on Cromite). Fallback remains
    adb reverse against a local dev server.
- Exit criteria: spike findings recorded; `nix develop` → `npm run dev` serves an
  empty R3F canvas on the pad.

## Stage 1 — Graph core & input model (renderer-agnostic)

- Zustand graph store: nodes/edges/positions/view state; node types: server,
  workspace, worktree, agent, schedule, integration-placeholder.
- Dexie persistence + JSON export/import (the user-journey safety net).
- Intent bus taxonomy: `nav.*`, `camera.*`, `node.*`, `ui.*`, `voice.*`.
- MockPaseoGateway emitting scripted daemon events.
- elkjs auto-arrange as an invoked tool.
- Exit criteria: store unit tests pass; mock events mutate graph; export/import
  round-trips.

## Stage 2 — Canvas & touch navigation

- Ortho camera, pan/zoom/pinch (camera-controls); `<Html>` TextSurface nodes; edge
  rendering; viewport culling + zoom-dependent LOD.
- Focus system (`focusedNodeId`) + camera tween-to-focus.
- Touch intents: tap-select, drag-place, long-press context.
- Exit criteria: on the pad — place, move, select, focus, pan 20+ nodes at 60fps.

## Stage 3 — Gamepad & game UX

- Gamepad API → intents: left-stick directional focus nav (direction ×
  inverse-distance scoring), face-button activation, shoulder jumps.
- Off-screen edge indicators fed by the event bus.
- Minimap: 2D canvas from the store; viewport rect; tap-to-teleport.
- Haptics if exposed (verify on device).
- Exit criteria: full graph navigation and node activation with gamepad only, zero
  touch.

## Stage 4 — Live Paseo mirror

- Real `PaseoGateway` over WebSocket (adb reverse path); daemon → graph projection:
  servers, workspaces, worktrees, agents, schedules; live status streaming.
- Agent creation from canvas; permission approve/deny from canvas.
- Reconnect/backoff handling.
- Exit criteria: end-to-end on the pad — create agent via gamepad, watch it run,
  approve a permission, see it finish.

## Stage 5 — Voice & hands-free

- STT (engine per Spike 0c) → mini-model interpretation → intent-bus commands
  and/or agent prompt drafts.
- Voice prompt authoring for agents (the keyboard replacement for free-text entry).
- Voice + gamepad combined UX: talk to command, stick to navigate.
- Exit criteria: on the pad — create and steer an agent entirely without a keyboard.

## Stage 6 — Journey polish & PWA

- Onboarding ("add server" first run), archive flow with visual decay, empty/error
  states.
- PWA: offline shell, install; Cromite PWA quirks verified.
- Device pass: performance budget, battery, orientation; dark theme tokens.
- Exit criteria: fresh device install → first agent run → archive, no desktop
  machine touched.

## Post-MVP (rough order)

XR immersive session (magic-window gyro dev mode is intent-bus driven and may land
any time after Stage 3) · HTMLTexture surfaces · integration nodes (daemon metadata
+ MCP events per Spike 0a) · multi-daemon · TWA wrapper · compass (needs camera
yaw) · collaboration/CRDT sync.

## Spike findings log

| Spike | Question | Finding | Date |
|---|---|---|---|
| 0a | Paseo event granularity? | — | — |
| 0b | HTML-in-canvas on Cromite? | — | — |
| 0c | STT engine options on device? | — | — |
| 0d | Pages → local daemon connectivity? | — | — |

## Feature flag policy

Flags are typed, default-off, named after stages or features (`stage4`, `voice`, …).
A stage is complete when its flag defaults on across a clean main build on the pad.
Flags are removed after one release cycle at default-on. No long-lived toggles.
