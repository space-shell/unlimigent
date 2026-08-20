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
| 0 | — | Foundations & spikes | ✓ complete 2026-08-20 |
| 1 | `stage1` | Graph core & input model | ☐ not started |
| 2 | `stage2` | Canvas & touch navigation | ☐ not started |
| 3 | `stage3` | Gamepad & game UX | ☐ not started |
| 4 | `stage4` | Live Paseo mirror | ☐ not started |
| 5 | `stage5` | Voice & hands-free | ☐ not started |
| 6 | `stage6` | Journey polish & PWA | ☐ not started |

## Stage 0 — Foundations & spikes

De-risk assumptions before they are load-bearing.

- [x] Scaffold: flake.nix devshell (nodejs 22), Vite + React + TS + `vite-plugin-pwa`,
  R3F/drei, lint/format config. (lint/typecheck/test/build all green; PWA SW
  generated)
- [x] Feature-flag module: typed flags object, persisted in settings, gating UI entry
  points. (`src/flags.ts`)
- Spikes (findings logged below):
  - [x] **0a** Paseo event surface — findings below.
  - [x] **0b** HTML-in-canvas on device — findings below.
  - [x] **0c** STT engine — findings below.
  - [x] **0d** Pages-origin → local daemon — findings below.
- Exit criteria: spike findings recorded; `nix develop` → `npm run dev` serves an
  empty R3F canvas on the pad. **Met 2026-08-20** — canvas, drei `<Html>`
  TextSurface, and webgl2 verified on the pad via screenshot + diagnostics
  (`scripts/device-*.mjs` CDP probes).

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
| 0a | Paseo event granularity? | **Answered — richer than assumed.** Daemon reachable at `ws://100.127.193.39:6767/ws` (no password on tailnet). SDK namespaces: `workspaces` (list/ref/open/create/archive/subscribe), `agents` (list/ref/create/subscribe), `providers` (listModels/listModes/listFeatures/listAvailable/snapshot/waitForReady/refresh/diagnostic/subscribe), `config` (get/patch). No global `client.on` — per-namespace `subscribe(handler)` returning an unsubscribe fn; no events observed on an idle daemon (payload shapes confirmed in Stage 4). `workspaces.list` payloads include `gitRuntime` (branch, remote, dirty, ahead/behind), `githubRuntime.pullRequest`, `forge`, `workspaceKind` (`local_checkout`), project grouping — **GitHub PR state arrives via daemon metadata; integration nodes need no separate GitHub API for MVP**. `agents.list` includes provider/model/status/activeTurn/capabilities (`supportsMcpServers`, `supportsToolInvocations`). No first-class permissions namespace in client 0.4.0 — permissions expected via agent status/events. License: `@getpaseo/client@0.4.0` ships no license field; monorepo root is AGPL-3.0 — fine for never-closed-source. Probe scripts: `scripts/spike-0a*.mjs` | 2026-08-20 |
| 0b | HTML-in-canvas on Cromite? | **Available and functional.** Cromite = Chromium 148: `layoutSubtree`, `drawElementImage`, `texElementImage2D`, `copyElementImageToTexture` all present; WICG complex-text demo renders on the pad (rotated/RTL/vertical CJK text, emoji, inline img, SVG). The `HTMLTexture` TextSurface slot is real on the target device. Caveat: WebGL is blocked per-site by Cromite policy — each origin used (localhost:5173, space-shell.github.io) needs Site settings → WebGL → Allow. | 2026-08-20 |
| 0c | STT engine options on device? | `SpeechRecognition`/`webkitSpeechRecognition` **present**, `getUserMedia` present, secure context ok. **WebAssembly disabled browser-wide** (`typeof WebAssembly === "undefined"` across origins — Bromite-inherited hardening) → whisper.cpp WASM path dead unless enabled via flag. Primary: native SpeechRecognition (live mic test pending — Cromite may strip Chromium's baked-in speech API key, in which case it errors at start); fallback: cloud STT via fetch. | 2026-08-20 |
| 0d | Pages → local daemon connectivity? | **Blocked.** HTTPS Pages origin throws synchronously on `new WebSocket("ws://…")` (mixed content) — both `ws://100.127.193.39:6767` and `ws://localhost:6767`. Pages deploy = on-the-go UI testing with mock data only; daemon-connected sessions use the localhost dev server via adb reverse, or a future wss:// reverse proxy on the tailnet. | 2026-08-20 |

## Feature flag policy

Flags are typed, default-off, named after stages or features (`stage4`, `voice`, …).
A stage is complete when its flag defaults on across a clean main build on the pad.
Flags are removed after one release cycle at default-on. No long-lived toggles.
