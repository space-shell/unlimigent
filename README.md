# unlimigent

```
┌──────────────────────────────────────────────┐
│  unlimigent — spatial agent orchestration   │
│        a spatial interface to paseo         │
└──────────────────────────────────────────────┘
```

A spatial user experience for the management and orchestration of AI agents.
An infinite-canvas, tablet-first, keyboard-less interface onto the
[Paseo](https://github.com/getpaseo/paseo) daemon: servers, workspaces, worktrees,
agents, integrations — the whole development journey mapped, and navigated by
touch, gamepad, gaze, and voice.

## Status

**Planning phase, pre-Stage 0.** Stage plan and live progress: [MVP.md](MVP.md).
Ethos, design language, and fixed decisions: [INTENT.md](INTENT.md).

## Stack

| Layer | Choice |
|---|---|
| Renderer | three.js + react-three-fiber + drei (orthographic, 2D plane) |
| UI surfaces | drei `<Html>` behind a `TextSurface` interface |
| State | Zustand → Dexie/IndexedDB, JSON export/import |
| Backend | `@getpaseo/client` via a mockable `PaseoGateway` |
| Input | Intent bus: touch, gamepad, gaze, speech (STT + mini-model) |
| Design | ASCII minimal, Muji feel — tokens in [INTENT.md](INTENT.md) |

## Development

The flake.nix devshell (nodejs 22+, Vite + React + TS + R3F) lands with Stage 0.
Until then this repo is docs plus a placeholder site.

## Deployment

`.github/workflows/deploy.yml` deploys to GitHub Pages on every push to `main` —
the on-the-go device-test surface. One-time repo setup: Settings → Pages →
Source: **GitHub Actions**.

Note: the Pages origin is HTTPS; connecting from it to a local daemon
(`ws://localhost:6767`) is unresolved (mixed content + Private Network Access —
Spike 0d in MVP.md). For daemon-connected development, use
`adb reverse tcp:5173 tcp:5173` against a local dev server.

## License

AGPL-compatible. Never closed source.
