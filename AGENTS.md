# AGENTS.md

Conventions for coding agents working in this repo. Read INTENT.md and MVP.md
first; they are the source of truth for what this project is and what is in scope.

## Environment

- NixOS host. All dependencies via a flake.nix devshell (`nix develop`) — no ad-hoc
  package installs. The devshell lands in Stage 0.
- Node.js 22+ inside the devshell.

## Process

- Trunk-based development, extreme-programming flavor: main always includes
  everything behind feature flags; small changes merged fast.
- Feature flags are typed, default-off, named after stages or features
  (`stage4`, `voice`, …). Complete = default-on across a clean main build on the
  device; removed after one cycle. No long-lived toggles.
- Commit little, commit often. Imperative subject lines
  (`canvas: cull Html nodes outside viewport`).
- Ask questions whenever anything is ambiguous. Do not guess scope.

## Scope discipline (strict MVP)

- A feature exists only if it maps to a stage in MVP.md. Anything else goes to the
  post-MVP list there, not into code.
- The MVP.md stage table is the live status tracker — update it in the same commit
  that changes stage state.

## Hard rules

- **Keyboard-less**: no feature may require a keyboard. Every interaction must be
  reachable through the intent bus (touch, gamepad, gaze, speech).
- **No raw colors**: only design tokens from INTENT.md, via a single tokens module
  once code exists. Monospace-first typography. Flat; no gradients.
- **Renderer-agnostic state**: graph/store code must not import renderer modules.
  Daemon access only through `PaseoGateway`.
- **Local-first**: unlimigent data stays in the browser (IndexedDB). No server of
  our own in the MVP.

## Testing

- Target device: OnePlus Pad 3, Cromite. On-device verification is the exit bar for
  every stage — "runs on desktop" does not count.
- Local device testing (pad on tailnet): app `http://localhost:5173/unlimigent/`
  via `adb reverse tcp:5173 tcp:5173` (secure context; dev server base path is
  `/unlimigent/`); daemon direct at `ws://100.127.193.39:6767/ws` — the daemon
  binds the tailscale interface, not loopback, so `adb reverse tcp:6767` forwards
  nothing.
- On-the-go testing: GitHub Pages deploy on push to main.

## Commands

All inside the devshell: `nix develop` first (or prefix with `nix develop -c`).

| Task | Command |
|---|---|
| Dev server | `npm run dev` (LAN/adb-reverse ready via `--host`) |
| Lint | `npm run lint` (oxlint) |
| Format | `npm run format` (prettier) |
| Typecheck | `npm run typecheck` (tsc --noEmit) |
| Tests | `npm run test` (vitest) |
| Build | `npm run build` (vite, PWA SW generated) |
| Spike 0a probes | `PASEO_URL=ws://host:6767/ws npm run spike:0a` |
