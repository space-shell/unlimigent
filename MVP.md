# unlimigent — MVP stages and status

Strict MVP. The game is the product; each stage proves one more kilometre of
the piloted journey on the physical device. Everything else is post-MVP.

- Current phase: **G0 — Foundations & spikes (Godot pivot)**
- Process: trunk-based, feature-flagged. Each stage = one or more flags; a
  stage is complete when its flag defaults on across a clean main build on the
  pad. Main always shippable.

## Pivot record (2026-09-10)

Native game pivot approved: Godot 4, Android pad (OnePlus Pad 3) as the exit
bar for every stage, pilotable ship replaces the web canvas as the sole
interface, web app retired at G3 parity. INTENT.md "game-like, not gamified"
reversed — points and engagement mechanics are in scope under the
operator-attention constraint. Full rationale in the 2026-09-10 architecture
review.

## G-stage table (live tracker)

| Stage | Flag | Focus | Status |
|---|---|---|---|
| G0 | — | Foundations & spikes | ◐ in progress |
| G1 | `g1` | Core port (graph/bus/gateway in GDScript) | ☐ not started |
| G2 | `g2` | Ship core (pilotable ship over the graph plane) | ☐ not started |
| G3 | `g3` | In-world management — web parity bar | ☐ not started |
| G4 | `g4` | Scoring engine (GAME_DESIGN.md phase 1) | ☐ not started |
| G5 | `g5` | Voice & hands-free | ☐ not started |
| G6 | `g6` | Polish & ship | ☐ not started |

## Web stage table (frozen at pivot — superseded by G-stages)

| Stage | Flag | Focus | Final status |
|---|---|---|---|
| 0 | — | Foundations & spikes | ✓ complete 2026-08-20 |
| 1 | `stage1` | Graph core & input model | ✓ complete 2026-08-20 |
| 2 | `stage2` | Canvas & touch navigation | ✓ complete 2026-08-20 (true 3D iso view, 61fps on pad) |
| 3 | `stage3` | Gamepad & game UX | ✗ never started — superseded, absorbed into G0c/G2 |
| 4 | `stage4` | Live Paseo mirror | ◐ read-only half verified 2026-08-20 — superseded by G3 |
| 5 | `stage5` | Voice & hands-free | ⏸ deferred — superseded by G5 |
| 6 | `stage6` | Journey polish & PWA | ✗ void (web retired) |

Web app disposition: frozen (no new features) at pivot; `src/` deleted in one
commit when G3 exit criteria are met.

## G0 — Foundations & spikes

De-risk the native pivot before it is load-bearing.

- [x] Devshell: godot_4 + gdtoolkit (gdlint/gdformat) + minimal Android SDK
  (androidenv.composeAndroidPackages) + jdk17 in flake.nix; Node 22 stays
  until web retirement. Shellhook points Godot editor settings at the store
  SDK.
- [x] Godot project scaffold under `game/`: project.godot, directory layout
  (autoloads/, world/, ship/, gateway/, ui/), tokens theme, JetBrains Mono
  asset (OFL), flags autoload. Headless boot verified 2026-09-10.
- Spikes:
  - [ ] **Ga** Android export from Nix — export pipeline verified
    2026-09-10: official 4.7.1 templates installed manually at
    `~/.local/share/godot/export_templates/` (1.2 GB, one-time); preset `pad`
    (arm64-v8a only, internet permission, debug keystore at
    `~/.android/debug.keystore`); `godot4 --headless --path game
    --export-release pad` → 26 MB signed APK. **Remaining:** on-device
    install + launch (pad disconnected during spike — first device session
    closes this).
  - [ ] **Gb** Daemon WS from the pad build — `WebSocketPeer` →
    `ws://100.127.193.39:6767/ws`, subscribe parity with Spike 0a findings.
    No CORS in native — verify the old dance is gone. **Capture items for
    GAME_DESIGN.md (rulings 2026-09-10):** permission pending/cleared payload
    shape; agent terminal status vocabulary; per-turn `activeTurn`
    transitions on `agents.subscribe`; `schedules` subscribe + fire events;
    workspace push-vs-poll on `workspaces.subscribe`.
  - [ ] **Gc** Input — gamepad (Android/SDL) and touch virtual joystick both
    verified on the pad.
- Exit criteria: an empty isometric scene running on the pad via `adb install`,
  daemon WS connected from the pad build, gamepad + joystick events flowing
  into the intent bus.

## G1 — Core port

Port the renderer-agnostic web core to GDScript; test cases port 1:1.

- Graph store autoload: nodes/edges/positions/view state; node kinds and
  statuses identical to the web core.
- `user://` persistence + JSON export/import (same format, version 1).
- Intent bus autoload: `nav.*`, `ship.*`, `node.*`, `ui.*`, `voice.*`.
- PaseoGateway: WebSocketPeer, reconnect/backoff, daemon → graph projection
  (servers, projects, workspaces, agents, schedules).
- MockGateway port: scripted scenarios (incl. the 38-node perf scenario) as
  data.
- Exit criteria: headless gdUnit green — store mutations, projection,
  persistence round-trip, mock event scripts.

## G2 — Ship core

The game feel. Nier hacking aesthetic on the token palette.

- Isometric world plane (45°, plus-mark grid) rendered from the graph store;
  entities as flat structures with status state.
- Pilotable ship: acceleration/drag flight model, camera follow, virtual
  joystick (touch) + gamepad via the intent bus.
- Approach-to-interact replaces tap-select: proximity ring, dock hold, focus
  tween.
- Exit criteria: on the pad — pilot to any entity and trigger inspect/focus,
  60fps with the 38-node scenario.

## G3 — In-world management (web parity bar)

- Create agent from the ship (prompt authoring via templates; free text lands
  with G5 voice).
- Permission approve/deny from the ship; live status streaming; reconnect.
- Exit criteria: end-to-end on the pad — create agent, watch it run, approve a
  permission, see it finish — zero keyboard. **Then: delete `src/`, retire the
  web app in the same commit, update this table.**

## G4 — Scoring engine

- GAME_DESIGN.md phase 1 implemented: event → points mapping over the daemon
  event stream, HUD, rank, combos, engagement mechanics configured under the
  operator-attention constraint.
- Scoring integrity: no points without a real daemon event; approval quality
  over approval speed.
- Exit criteria: on the pad — a full work session played to completion with
  score, rank, and at least one engagement loop active; GAME_DESIGN.md marked
  implemented for phase 1.

## G5 — Voice & hands-free

- transcribe.cpp sidecar over tailnet (Spike 0c decision) → mini-model →
  intents/prompts; voice prompt authoring for agents.
- Exit criteria: on the pad — create and steer an agent entirely without
  touching the screen or a controller.

## G6 — Polish & ship

- Onboarding (first connect), archive flow with visual decay, empty/error
  states; dark theme tokens; perf/battery pass; signed release build.
- Exit criteria: fresh pad install → first agent run → archive → score
  recorded, no desktop machine touched.

## Post-MVP (rough order)

Desktop Linux export · XR immersive session · integration entities (daemon
metadata + MCP events per Spike 0a) · multi-daemon · web companion build
(read-only mirror, only if a real need appears) · collaboration.

## Spike findings log

| Spike | Question | Finding | Date |
|---|---|---|---|
| 0a | Paseo event granularity? | **Carries into the G-stages — primary input to gateway port and scoring.** Daemon reachable at `ws://100.127.193.39:6767/ws` (no password on tailnet). SDK namespaces: `workspaces` (list/ref/open/create/archive/subscribe), `agents` (list/ref/create/subscribe), `providers` (listModels/listModes/listFeatures/listAvailable/snapshot/waitForReady/refresh/diagnostic/subscribe), `config` (get/patch). No global `client.on` — per-namespace `subscribe(handler)`. `workspaces.list` payloads include `gitRuntime` (branch, remote, dirty, ahead/behind), `githubRuntime.pullRequest`, `forge`, `workspaceKind`, project grouping — GitHub PR state arrives via daemon metadata. `agents.list` includes provider/model/status/activeTurn/capabilities. Hierarchy: server → project → workspace (local \| worktree, siblings) → sessions. No first-class permissions namespace in client 0.4.0 — permissions expected via agent status/events. License AGPL-3.0-compatible. Probe scripts: `scripts/spike-0a*.mjs` (Node — retained until web retirement). | 2026-08-20 |
| 0b | HTML-in-canvas on Cromite? | **Web-era; void at pivot.** Cromite Chromium 148 complex-text APIs present; WebGL per-site allow needed. Irrelevant to Godot. | 2026-08-20 |
| 0c | STT engine options? | **Carries into G5.** Decision: transcribe.cpp sidecar on the daemon host (tailnet WS, 16 kHz PCM, committed/tentative partials); mini-model maps transcripts to intents/prompts. Native app keeps the same sidecar path. | 2026-08-20 |
| 0d | Pages → local daemon connectivity? | **Web-era; void at pivot.** Mixed content blocked HTTPS→ws://; dev path was localhost:5173 + `daemon.cors.allowedOrigins`. Native has no CORS/mixed-content — Spike Gb verifies. | 2026-08-20 |
| Ga | Godot Android export from Nix? | **Answered 2026-09-10 (pipeline).** Works with: flake `androidenv.composeAndroidPackages {}` (new nixpkgs API; old `composeAndroidSDK` gone) + `config.android_sdk.accept_license = true`; Godot needs the classic layout — use `<sdk>/libexec/android-sdk` as the editor `android_sdk_path`; jdk17 for apksigner; shellhook idempotently patches `~/.config/godot/editor_settings-*.tres`. Export templates 4.7.1 installed manually (1.2 GB tpz = zip, not tar) — not nix-managed. Preset `pad`: arm64-v8a only, non-custom gradle (no gradle/AGP needed), debug keystore signing. Output: 26 MB APK, `adb install` pending device connection. | 2026-09-10 |

## Feature flag policy

Flags are typed, default-off, named after stages or features (`g2`, `voice`,
…), held in the flags autoload (settings-persisted). A stage is complete when
its flag defaults on across a clean main build on the pad. Flags are removed
after one release cycle at default-on. No long-lived toggles.
