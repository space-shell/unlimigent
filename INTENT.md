# unlimigent — Intent

A native game for the management and orchestration of AI agents.

unlimigent is a Godot 4 game in which you pilot a small ship through a virtual
world whose structures are your real agent fleet, mapped from the
[Paseo](https://github.com/getpaseo/paseo) daemon. The ship is not a mode on
top of a management UI — it **is** the interface. Servers, projects,
workspaces, agents appear as entities in the world; you fly to them, interact,
and earn points for managing them well.

## Product thesis

- The game **is** the product. Paseo owns orchestration and truth; unlimigent
  owns the journey: piloting, encountering, and commanding agents in a virtual
  world.
- Points are earned only through real-world outcomes: successful management of
  agents' inputs and outputs, derived from daemon events. Never simulated,
  never farmable by presence.
- Engagement mechanics are deliberate and welcome (streaks, decay, variable
  rewards — the Candy Crush / Clash of Clans vocabulary), under one hard
  constraint: **they must reinforce correct, timely management — not raw
  session time.** Loss-aviation timers may only exist where the real workflow
  has a real deadline. Points reward approval quality, not approval speed.
- Local-first: all unlimigent-specific data (graph, layout, settings, score)
  lives on-device under `user://`. The daemon owns agent truth; the game owns
  view truth.

## The user journey

Launch into the world. Structures rise from existing daemon state: servers,
projects, workspaces, agent sessions. Fly the ship to an entity to inspect it;
dock to act — launch an agent, approve a permission, watch it run. Work
completes, PRs merge, threads resolve: the structure decays and sinks back
into the plane. Points accrue for outcomes; rank and streaks reflect
management quality over time.

## Node ontology (verified against live daemon + paseo docs 2026-08-20)

The world mirrors Paseo's containment exactly — deletion and creation of
entities map 1:1 onto daemon lifecycle events:

```
server (daemon host)
└── project                    projectId / projectDisplayName
    └── workspace              isolation: local_checkout | worktree (SIBLINGS,
        │                      never nested — a worktree does not require a
        │                      local root; daemon-managed worktrees live under
        │                      ~/.paseo/worktrees/)
        └── session            agent sessions today; terminals / browsers /
             │                  diffs post-MVP
             └── sub-agents     agents run by an agent join the caller's
                                workspace as sibling sessions
```

- Workspace archive → entity is removed. Daemon "done" workspaces stay visible
  (official client parity) shown with a done status; only genuinely archived
  entities (archivingAt / status "archived") are hidden.
- Project with no live workspaces → project entity is removed.
- Post-MVP session kinds (tools, files) attach under their workspace.

## Interaction ethos

**Keyboard-less.** No feature may depend on a keyboard. Input sources:

| Source | Role |
|---|---|
| Touch | Virtual joystick piloting, tap-to-target, dock interaction |
| Gamepad | Primary piloting and navigation (Android/SDL) |
| Gaze | XR input (post-MVP device) |
| Speech | STT + mini-model interpretation: commands and prompt authoring |

All sources normalize into one intent bus (`input → intent → action`), carried
into Godot as a single autoload. Voice is the keyboard replacement for
free-text entry.

**Gamified, honestly.** Points, ranks, streaks, and engagement loops are part
of the design language — but the scoring feed is the daemon's real event
stream, and the loops are configured so that the player's incentive and the
operator's duty point the same way. See GAME_DESIGN.md (living document,
authored by the game-design agent) for the full catalog.

## Design language — ASCII minimal, Nier hacking feel

Reference: the hacking minigame in NieR: Automata — isometric, narrow palette,
calm geometry that turns hostile only on state. Modern minimal, Muji feel:
monospace-first, structure from typography and hairline rules, playful through
restraint.

- Typography: monospace everywhere (JetBrains Mono shipped as an asset).
  Text is interface, not ornament.
- Palette: the token set below, narrowed in play — neutrals carry the world;
  accents appear only on state (running, attention, error, success, archive).
  Flat. No gradients; no shadows-as-depth except focus.
- World plane: isometric, rotated 45°, plus-mark grid, manhattan edges —
  inherited from the web MVP's verified canvas orientation.
- Ship: small, precise, readable at any zoom. The ship's light/trace uses one
  accent.

Design tokens (single source of truth; no raw hex outside the Godot theme):

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

Dark theme variants are deferred to G6; tokens are defined once, themed later.

## Fixed decisions

| Decision | Choice |
|---|---|
| Engine | Godot 4 (MIT), GDScript, Android export; OnePlus Pad 3 is the exit bar |
| Interface | The pilotable ship is the sole interface; replaced the web canvas 2026-09-10 |
| State | Graph store as an engine-agnostic autoload (no scene dependencies), persisted under `user://` (JSON export/import) |
| Backend | Direct `WebSocketPeer` to the daemon behind a single mockable `PaseoGateway` autoload; the daemon is the only truth |
| Layout | Manual placement + optional auto-arrange as a tool, never policy |
| Input | Intent bus autoload: touch + gamepad at MVP; speech enters the same bus (G5) |
| Speech | transcribe.cpp sidecar on the daemon host over tailnet (browser-era Spike 0c decision carries over); mini-model maps transcripts to intents/prompts |
| Scoring | Points derive only from daemon events; engagement mechanics constrained by the operator-attention rule |
| Integrations | Derived from daemon data: workspace metadata first, MCP tool calls second |
| Process | Trunk-based, feature-flagged, main always shippable |
| License | Never closed source; AGPL-compatible |

## Target devices

- Primary test device: OnePlus Pad 3 — Godot Android export, installed via adb.
- Development host: NixOS desktop; desktop runs are dev-only and never count
  as the exit bar.
- XR headset: future. Nothing in the architecture forecloses it.

## What unlimigent is not

- Not an orchestrator. The Paseo daemon owns agents, scheduling, and execution.
- Not a chat client. Transcript inspection exists; conversation is not the
  surface.
- Not a simulation. The world's state is the daemon's state; there is no
  offline "fake fleet" gameplay.
