# AGENTS.md

Conventions for coding agents working in this repo. Read INTENT.md and MVP.md
first; they are the source of truth for what this project is and what is in
scope.

## Environment

- NixOS host. All dependencies via a flake.nix devshell (`nix develop`) — no
  ad-hoc package installs. Devshell contents land in G0.
- Godot 4 + gdtoolkit (gdlint/gdformat) in the devshell; GDScript only.
- Node.js 22 remains in the devshell only until the web app is retired at G3.

## Process

- Trunk-based development, extreme-programping flavor: main always includes
  everything behind feature flags; small changes merged fast.
- Feature flags are typed, default-off, named after stages or features
  (`g2`, `voice`, …), held in the flags autoload. Complete = default-on across
  a clean main build on the pad; removed after one cycle. No long-lived
  toggles.
- Commit little, commit often. Imperative subject lines
  (`ship: damp joystick input at high zoom`).
- Ask questions whenever anything is ambiguous. Do not guess scope.

## Scope discipline (strict MVP)

- A feature exists only if it maps to a G-stage in MVP.md. Anything else goes
  to the post-MVP list there, not into code.
- The MVP.md G-stage table is the live status tracker — update it in the same
  commit that changes stage state.

## Hard rules

- **Keyboard-less**: no feature may require a keyboard. Every interaction must
  be reachable through the intent bus autoload (touch, gamepad, speech).
- **No raw colors**: only design tokens from INTENT.md, via the Godot theme
  resource. Monospace-first typography. Flat; no gradients.
- **Engine-agnostic state**: graph store and gateway are autoloads with no
  scene dependencies. Daemon access only through `PaseoGateway`.
- **Local-first**: unlimigent data stays on-device under `user://`. No server
  of our own in the MVP.
- **Scoring integrity**: points derive only from real daemon events; no
  mechanic may reward raw session time (INTENT.md operator-attention
  constraint).

## Testing

- Target device: OnePlus Pad 3 — Godot Android export installed via adb.
  On-device verification is the exit bar for every stage — "runs on desktop"
  does not count.
- Device loop: `adb install` the exported build; daemon direct at
  `ws://100.127.193.39:6767/ws` over tailnet (native has no CORS — no config
  dance needed).
- Headless automated tests (gdUnit) run in CI/devshell; they never replace the
  device bar.

## Commands

All inside the devshell: `nix develop` first (or prefix with `nix develop -c`).

| Task | Command |
|---|---|
| Godot editor | `godot4 game/project.godot` (or `godot4 --path game`) |
| Run (desktop dev) | `godot4 --path game` |
| Tests (headless) | `godot4 --headless --path game -s addons/gdUnit4/bin/GdUnitCmdTool.gd --ignoreHeadlessMode -a "tests"` |
| Lint | `gdlint game/autoloads game/core game/gateway game/tests game/theme game/world` (vendored `game/addons` is excluded) |
| Format | `gdformat <dirs>` (same scope as lint) |
| Android export | `godot4 --headless --path game --export-release pad` |
| Web (legacy, until G3) | `npm run dev` / `build` / `test` / `lint` / `typecheck` in repo root |
