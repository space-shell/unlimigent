# unlimigent — Intent

A spatial user experience for the management and orchestration of AI agents.

unlimigent is a tablet-first, keyboard-less, infinite-canvas interface onto the
[Paseo](https://github.com/getpaseo/paseo) daemon. It maps the full lifecycle of
agent-driven development — servers, workspaces, worktrees, agents, integrations,
archive — onto a navigable spatial graph.

## Product thesis

- The spatial map **is** the product. Paseo owns orchestration and truth; unlimigent
  owns the journey: seeing, navigating, and commanding agents in space.
- The user journey is the focus of development. Layout and flow are fluid; everything
  else exists to serve them. Development therefore follows a strict MVP with stages
  tracked in [MVP.md](MVP.md).
- Local-first: all unlimigent-specific data (graph, layout, settings) lives in the
  browser. The daemon owns agent truth; the browser owns view truth.

## The user journey

A blank canvas. Add a server. Branching from it: folders, then worktrees. From
worktrees: branches to GitHub, Slack, Linear nodes — the entire development process
visible at a glance. Development complete, CI green, PRs merged, threads resolved:
the branch is archived, decaying out of the graph.

## Interaction ethos

**Primarily keyboard-less.** No feature may depend on a keyboard. Input sources:

| Source | Role |
|---|---|
| Touch | Direct manipulation: place, drag, select, pinch |
| Gamepad | Primary navigation: focus jumps, activation, camera |
| Gaze | XR input (post-MVP device) |
| Speech | STT + mini-model interpretation: commands and prompt authoring |

All sources normalize into one intent bus (`input → intent → action`). Speech enters
the same bus: transcript → mini-model → intent(s), or agent prompt draft. Voice is
the keyboard replacement for free-text entry.

**Game-like, not gamified.** Jump navigation, screen-edge alerts, minimap, haptics —
the feel of a game HUD without points, streaks, or stimulation mechanics.

## Design language — ASCII minimal, Muji feel

Modern minimal. Monospace-first, ASCII/box-drawing chrome, muted colors that pop
only where state demands attention. Playful through restraint, not decoration.

- Typography: monospace everywhere (`ui-monospace`, JetBrains Mono / IBM Plex Mono
  fallbacks). Text is interface, not ornament.
- Chrome: structure from typography, spacing, and hairline rules. Box-drawing /
  geometric glyphs (`─ ◇ ◉ ▲`) only as micro-accents — list markers, dividers,
  relation hints. Never decorative ASCII borders or banner art. Flat. No
  gradients; no shadows-as-depth except focus.
- Color: token palette below. Neutrals carry the page; accents appear only on state
  (running, attention, error, success, archive). Muted base, popping on demand.
- Whitespace: generous. Muji: functional, unbranded, calm.
- On-device check 2026-08-20: palette and monospace typography confirmed good;
  literal ASCII art reads as noise — excluded.

Design tokens (single source of truth; no raw hex outside the tokens module):

| Token | Value | Use |
|---|---|---|
| `paper` | `#F6F3EE` | Background |
| `ink` | `#2B2A27` | Primary text |
| `ink-faint` | `#8A867E` | Secondary text |
| `terracotta` | `#C26B4D` | Attention / alerts |
| `moss` | `#7D8F70` | Success / merged |
| `indigo` | `#5D6FA3` | Agents / running |
| `ochre` | `#C6A233` | Warnings / permissions |
| `plum` | `#8E6E7E` | Archive / decay |

Dark theme variants are deferred to Stage 6; tokens are defined once, themed later.

## Fixed decisions

| Decision | Choice |
|---|---|
| Renderer | three.js + react-three-fiber + drei, orthographic camera on a 2D plane |
| Text/UI surfaces | drei `<Html>` (MVP) behind a `TextSurface` interface; HTMLTexture (HTML-in-canvas) adopted when device support lands (Spike 0b) |
| State | Zustand, renderer-agnostic graph store, persisted via Dexie/IndexedDB; JSON export/import |
| Backend | `@getpaseo/client` behind a single mockable `PaseoGateway`; the daemon is the only truth |
| Layout | Manual placement + optional auto-arrange (elkjs) as a tool, never policy |
| Input | Intent bus: touch + gamepad at MVP; gaze and speech enter the same bus |
| Speech | transcribe.cpp (ggml, MIT) via a Node sidecar on the daemon host; browser AudioWorklet → 16 kHz PCM over tailnet WebSocket → committed/tentative partials; mini-model maps transcripts to intents/prompts. Fallbacks: native SpeechRecognition, whisper.cpp WASM |
| Integrations | Derived from daemon data: workspace metadata first, MCP tool calls second, transcript parsing never as truth |
| Process | Trunk-based, feature-flagged, main always shippable |
| License | Never closed source; AGPL-compatible |

## Target devices

- Primary test device: OnePlus Pad 3, Cromite browser.
- On-the-go testing: GitHub Pages (HTTPS) via `.github/workflows/deploy.yml`.
- XR headset: future. Nothing in the architecture forecloses it; nothing in the MVP
  depends on it.

## What unlimigent is not

- Not an orchestrator. The Paseo daemon owns agents, scheduling, and execution.
- Not a chat client. Transcript inspection exists; conversation is not the surface.
- Not auto-layouted. The user arranges meaning; the machine assists only on request.
