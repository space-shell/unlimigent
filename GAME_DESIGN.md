# unlimigent — Game Design

Living document. Phase 1 (G4) scope is marked per mechanic; everything else is
sketch. Ground truth for every scoreable signal: Spike 0a findings (MVP.md) —
SDK namespaces `workspaces` / `agents` / `providers` / `schedules` /
`config`, per-namespace `subscribe(handler)`, no global `client.on`, no
first-class permissions namespace (permissions arrive via agent status/events),
PR state via `workspaces` payload `githubRuntime.pullRequest`, agent detail via
`agents.list` (`provider` / `model` / `status` / `activeTurn` /
`capabilities`). Hard constraint from INTENT.md applies throughout: engagement
reinforces correct, timely management — never raw session time; loss-aversion
timers only where the workflow has a real deadline; quality over speed.

## 1. Core loop

**Pilot → encounter → manage → real outcome → score.** Every arrow is a real
transition; the last two are daemon events, not player gestures.

### Second-to-second

Fly the ship (joystick/gamepad via intent bus). Entities pulse on state: an
agent requesting permission bleeds `ochre`; a provider that dropped turns
`terracotta`-hostile. Approach → proximity ring → dock-hold (600 ms) → the
entity's panel opens. Actions from the panel (approve, deny, archive, refresh
provider, launch from template) are issued through `PaseoGateway`; the UI
acknowledges the daemon echo, never the local call. Score changes only on the
echo.

### Minute-to-minute

2–5 agents run concurrently across workspaces. The operator routes between
them: clear a permission here, watch a turn complete there, archive a done
workspace (it sinks, `plum`). Successful turns chain into per-workspace combo
multipliers; pending permissions bank a decaying flow bonus that the operator
can still capture by responding while the agent is genuinely blocked. Errors
reset chains. The minute-level tension is triage, not dexterity.

### Session-level

A session = app launch → app close (points persist across sessions; "session
score" is this launch's accrual). At launch the world rises from live daemon
state and 3 session goals are generated from that state. During play: HUD
score, rank bar, streak counters, goal chips. On exit: a voyage recap
(events resolved, points by category, streak status, rank delta) — all
computed from the session's daemon event log. Nothing in the recap is
estimated.

## 2. Points ontology

Base values in points. Every row cites its daemon signal (detail in §7).
Caps are per rolling local calendar day on the pad.

| Event | Daemon signal | Base | Notes / caps |
|---|---|---|---|
| Agent created | `agents` subscribe: new agent, status `initializing` | 10 | cap 100/day (20 agents) |
| Agent turn completed | `activeTurn` transition → completed, agent returns to `idle`, no error | 15 × M(n) | chain multiplier below |
| Agent session finished clean | agent reaches terminal success state | 40 | per session |
| Agent error | status → `error` | 0 | resets chain; resolves escrow poor |
| Workspace created | `workspaces` subscribe: new workspace | 15 | cap 50/day |
| Workspace archived | `workspaces` archive lifecycle (`archivingAt` / status `archived`) | 25 | housekeeping; entity sinks |
| Permission approved | agent status/event: request pending → cleared by player action; banked on turn outcome | 20 × Q × tier | see Q; escrowed (§6) |
| Permission denied | same, denial path | 10 × Q | same escrow rule |
| Permission stale | pending age ≥ 60 min | 0 | flow floor; goal damage (§4) |
| PR opened | `githubRuntime.pullRequest` state → open | 20 | per PR |
| PR merged | state → merged | 250 | rare cargo tier |
| PR closed unmerged | state → closed (not merged) | 0 | record only |
| Provider restored | `providers` subscribe: unavailable → ready within 5 min of player `refresh` | 30 | cap 6/day |
| Provider restored unprompted | same transition, no player refresh | 10 | cap 2/day |

**Chain multiplier** M(n) = 1 + 0.1 × min(n − 1, 9), i.e. 1.0× → 2.0× over 10
consecutive successful turns in one workspace. Resets on: any error in that
workspace, or a > 30 min gap with no successful turn there. Chains measure
sustained real work, not presence.

**Approval quality tier Q** (retrospective, resolved when the agent's turn
terminates):

| Outcome after player response | Q |
|---|---|
| Approved → turn finishes clean | ×1.5 (vindicated) |
| Approved → turn errors | ×0.25 (poor) |
| Denied → agent still finishes | ×1.5 (vindicated — blocked a needless action) |
| Denied → agent errors immediately after | ×0.25 (poor) |
| Anything else / no observable consequence | ×1.0 (neutral) |

**Flow bonus** (the only time-sensitive component): F(t) = 10 × 2^(−t/600s),
floored at 0 when t ≥ 3600 s, where t = pending age at response. Max flow
contribution is 25% of a maximally-scored approval (20 × 1.5 + 10 = 40), so
timeliness can tilt, never dominate. Quality ×1.5 is unreachable for
rubber-stampers (§6), so fast-blind < careful-correct always.

**Decay curves in the system** (there is no decay of banked points — absence
is never punished): flow bonus half-life 10 min; chain 30 min idle gap;
rubber-stamp window rolling last 10 responses.

### Explicitly unscoreable (no daemon signal — do not invent)

- Correctness of an approval *at decision time* (only retrospective via
  outcome; acknowledged cost: model failures misattribute ×0.25, bounded).
- Permission expiry windows — client 0.4.0 surfaces none; our 60-min flow
  floor is view-state bookkeeping, not a daemon deadline (open question Q1).
- CI red/green — no CI namespace; `githubRuntime.pullRequest` carries merge
  state only.
- Prompt quality, token usage, terminal output content, diff size — not in
  any Spike 0a payload.
- Session time, flight time, docking counts — forbidden by constraint.
- Schedule fires — `schedules` namespace exists but wasn't probed; deferred
  to phase 2 pending confirmation.

## 3. Objectives & goals

All goals predicate on daemon events only.

**Session goals** — 3 active. Generated at session start from the live graph
by a weighted pool, only proposing goals achievable from current state ("merge
a PR" appears only if ≥ 1 workspace has an open PR). Examples by tier:

| Tier | Reward | Examples |
|---|---|---|
| Minor | 100 | resolve 2 permissions; archive 1 done workspace |
| Major | 250 | 5 successful turns in one workspace; 1 clean agent finish |
| Voyage | 500 | 1 merged PR; 10 successful turns fleet-wide, zero errors |

Refresh: a completed goal is replaced after a 120 s cooldown; max 5
generations per slot per session; goal rewards cap 1,200/day — kills
goal-churn farming. Expire (no reward, no penalty): predicate becomes
unsatisfiable via real events (workspace archived, PR closed unmerged, agent
closed). Expiry is a consequence, not a punishment.

**Daily goals** — 3 per calendar day, same generator, tiered 100 / 200 / 400.
No login bonus of any kind: opening the app grants nothing. Completing all
three = clean day.

**Day-streak multiplier** on daily-goal rewards: G(s) = 1 + 0.05 × min(s, 20)
→ cap ×2.0, where s = consecutive clean days. A streak breaks **only** by a
day containing real negligence (a permission gone stale under §4 conditions,
or an agent sitting in `error` unobserved > 24 h while the app was open that
day). A skipped day neither extends nor breaks the streak — it holds. No
"play daily or lose it" mechanic: that would punish absence, which the
constraint forbids.

**Long-term arcs (phase 2 sketch)** — rank ladder (phase 1); fleet diversity
log (run one agent on each provider/model pair you have — collect-them-all
over real fleet composition); weekly voyage ledger (sliding 7-day clean-day
count); season expeditions (deferred).

## 4. Fail states

No game-over, no lives, no HP. The underlying reality is a dev fleet; losing
is efficiency collapse and bad records, all real-event-derived:

- **Turn failure** (`error` status): chain resets, escrowed approval for that
  turn resolves ×0.25, structure renders `terracotta`. No point deduction —
  errors are often not the operator's fault; the cost is lost multiplier and
  lost escrow.
- **Neglected permission**: pending age ≥ 60 min **and** the app had an open
  session for ≥ 20 of those minutes → marked *neglected*: flow bonus already
  floored, any goal referencing it fails, day-streak breaks. If the app was
  never open, it is *stale*, not *neglected*: goals may fail, the streak
  holds.
- **Red shift** (session record): > 50% of concurrently-active agents in
  `error` at once. The voyage log marks the session RED; grid turns hostile
  (`terracotta` pulse). No mechanical penalty beyond what the errors already
  cost.
- **Disconnect** (the honest fail): daemon unreachable → world greys to
  `ink-faint`, no accrual, no penalty. Earning nothing while absent is the
  only absence cost in the game.

No fabricated failure exists anywhere: every fail state above is triggered by
a daemon event or a real-time gap measured against one.

## 5. Engagement pattern catalog

Each pattern: what / why / config / constraint case / phase.

| # | Pattern | Why here | Exact configuration | Constraint case | Phase |
|---|---|---|---|---|---|
| 1 | **Streaks** (clean-shift, responsiveness) | Make good operating habitual | Clean shift = agent session finish with zero errors; responsiveness streak = 10 consecutive permissions answered before flow floor (t < 60 min). Counters shown in HUD; multiplier via day-streak G(s) only | Streaks increment only on real outcomes; break only on real negligence (§3/§4). Never on absence | **G4** |
| 2 | **Loss aversion** (escrow decay) | Mirror the real cost of a blocked agent | Flow bonus F(t) half-life 10 min, floor 60 min, ≤ 25% of any approval's max value | The timer is *elapsed real pending time* — a real stalled-work condition, not a fabricated countdown; magnitude capped so it can't outweigh quality. Contingency flagged at Q1 | **G4** |
| 3 | **Variable rewards** (cargo salvage) | Completion feels like loot, not payroll | Completed turns / merges reveal "cargo" of 10–25 pts (turns) / 250–280 pts (merges), value = deterministic hash of event ID mapped into the band. Rare tiers: merge (rare), clean finish (uncommon) | Every roll requires a real daemon event; hash-determinism means no RNG farming; band width ±20% keeps variance cosmetic | **G4** (merge/turn tiers; rarity flourish phase 2) |
| 4 | **Combos / chains** | Reward sustained correct management | M(n) up to ×2.0 over 10 consecutive successful turns per workspace; 30 min idle gap resets | Multiplier rides turn outcomes only; idling earns nothing | **G4** |
| 5 | **Daily goals + day-streak** | Structure the operator's day around real duties | 3/day, tiered 100/200/400; G(s) cap ×2.0; break only on negligence; skip holds | No login reward; goals complete only via daemon events; absence unpunished | **G4** |
| 6 | **Session recap (voyage log)** | Loss-aversion-adjacent pride: a record you don't want to sully | Exit screen: events resolved, points by category, streak states, RED mark if earned | Purely a report of real events; no mechanical teeth beyond RED record | **G4** |
| 7 | **Rank ladder** | Long-horizon progression | XP = lifetime points 1:1. DECKHAND 0, LOOKOUT 500, HELMSMAN 1,500, QUARTERMASTER 4,000, NAVIGATOR 10,000, FIRST MATE 25,000, CAPTAIN 60,000, FLEETMASTER 150,000 (geometric ≈ ×2.5) | XP only from §2 events; rank never decays | **G4** |
| 8 | **Collection / completion** | Catalog the real fleet | Fleet diversity log: one entry per provider/model pair actually run (from `agents.list` fields); completeness % shown | Collecting requires really running agents on each pair; no purchasable shortcuts | Phase 2 |
| 9 | **Timers (real only)** | Countdowns feel urgent; only real deadlines allowed | Display-only: elapsed pending age on permission ring (ochre→terracotta). Schedule-backed countdowns only if `schedules` events confirm (Q5) | Every displayed timer is elapsed real time or a daemon-declared deadline; no fabricated countdowns anywhere | G4 (elapsed) / phase 2 (schedules) |
| 10 | **Cosmetics** | Self-expression as long-tail retention | Ship trail colorways per token (plum, moss, indigo…), rank insignia glyphs — earned by achievements/rank, never purchasable in MVP | Zero score impact; cannot be bought with anything | Phase 2+ |

Patterns deliberately **rejected**: lives/energy system (punishes absence),
spin-the-wheel daily bonus (points without events), time-served XP (raw
session time), streak-freeze purchasable (monetizes fabricated loss).

## 6. Scoring integrity — anti-farming rules

1. **No points without a daemon event.** The scoring engine consumes only the
   gateway's event stream (daemon echoes). UI intents alone score zero.
2. **Idempotent scoring.** Events dedupe on (namespace, entity id, event id /
   status-transition key); resubscribes and reconnect replays never re-score.
3. **Rubber-stamp detector.** If median response latency over the last 10
   permission responses < 5 s: quality tier locked to ≤ neutral (×1.0) and
   flow bonus zeroed for those responses. Fast-blind therefore caps at
   20 × 1.0 = 20 pts/response; careful-correct reaches 20 × 1.5 + 10 = 40.
   Approve-everything-fast is structurally worse than correct approvals.
4. **Escrow on real outcome.** Approval/denial points bank only when the
   turn terminates (clean → full, error → ×0.25). You cannot farm approvals
   faster than agents actually complete turns.
5. **Daily caps** on volume-sensitive events (agent creates 100/day, workspace
   creates 50/day, provider restores 6/day, goal rewards 1,200/day, permission
   flow 300 pts/hour) — real-event spam stays worthless.
6. **No time-based accrual.** No mechanic in this document grants points per
   minute, per session length, or per launch. Absence earns nothing and costs
   nothing already banked.
7. **Player-action points require daemon echo.** Launch, approve, deny,
   archive, refresh score only in their daemon-confirmed form (rows in §2);
   failed calls score zero.

## 7. Real-world outcome mapping

Exact daemon source per scoring event (Spike 0a ground truth; client 0.4.0):

| Scoring event | Source | Detection |
|---|---|---|
| Agent created | `agents` namespace (`agents.list`, `agents.subscribe`) | new agent id appears; status `initializing`; payload carries provider/model/status/activeTurn/capabilities |
| Agent running | same | status transition → `running` (state marker only — no points) |
| Turn completed | same | `activeTurn` completion transition, agent → `idle` without error |
| Agent finished clean / error | same | terminal status (`finished`/`error`; exact vocabulary is a Gb verification item — Q2) |
| Permission requested | **no dedicated namespace** — agent status/events | pending-permission payload observed via `agents.subscribe`; exact shape pending Gb (Q3) |
| Permission approved/denied | same, after player action via gateway | pending state clears; response timestamp recorded locally against daemon echo |
| Workspace created/archived | `workspaces` namespace (`list`/`subscribe`, archive lifecycle) | new workspace id; `archivingAt` / status `archived` |
| PR opened/merged/closed | `workspaces` payloads: `githubRuntime.pullRequest` (+ `forge`) | diff consecutive subscribe/list payloads for state transition; PR state is daemon metadata, not a dedicated event namespace |
| Provider status | `providers` namespace (`subscribe`, `snapshot`, `refresh`) | availability transition unavailable → ready; player-refresh correlation from gateway call log |
| Git state (context, unscored) | `gitRuntime` (branch, remote, dirty, ahead/behind) | rendered on entity; no scoring — no outcome semantics |

Unscoreable-by-signal list repeats here: CI status, permission expiry
windows, prompt/token metrics, terminal content, schedule fires (unverified).

## 8. Phase plan

**Phase 1 — G4 (build this, nothing more):** §2 rows for agent lifecycle,
permissions (with escrow + rubber-stamp detector), workspace create/archive,
PR merge; chain multiplier; flow bonus; cargo variance for turns/merges;
ranks DECKHAND→FLEETMASTER; session goals + daily goals + day-streak; HUD
(score, rank bar, streaks, goal chips, pending count); voyage recap.
Engagement loops live: #1–#7 in their G4 configuration.

**Phase 2+ (sketch, decisions deferred):** fleet diversity log (#8);
schedules as scoreable events (#9) if the namespace confirms; cosmetics and
insignia (#10); seasonal expeditions; possibly retrospective-quality
weighting improvements if the daemon ever surfaces richer permission
semantics. Nothing in phase 2 may relax §6.

**G4 exit bar** (from MVP.md, restated as design): on the pad, a full work
session played to completion — real agents launched, permissions answered,
≥ 1 turn finished — with score, rank, and ≥ 1 engagement loop visibly
affecting play.

## 9. Aesthetic notes — NieR hacking calm, state-hostile geometry

NieR: Automata's hacking minigame reference: calm, ordered, monochrome space
that turns hostile only on state. Our world is the same grid at rest.

- **Score** — top-left, JetBrains Mono tabular figures, tick-up animation
  300 ms per digit roll (paper cutout on `ink`). Cargo reveals as a bracketed
  readout `[ +17 CARGO ]` in `ink`, rarity tier in the accent below.
- **Rank** — glyph tag under the score, `ink-faint` (`[ QTRMST ]`), XP as a
  hairline `ink-faint` rule that fills `ink`. Promotion: single 400 ms
  full-grid line-scan in `moss`.
- **Streaks** — no separate chrome: the ship's trace brightens within the
  `indigo` ramp as chain M(n) climbs (one accent, intensity-only), and dims to
  `ink-faint` on reset. Responsiveness streak shows as a row of plus-marks
  (grid motif) in `indigo`, ×10 cap.
- **Permissions / escrow** — an `ochre` arc grows around the entity's
  proximity ring as pending age consumes F(t); crossing the 60 min floor
  shifts the arc `terracotta` and the grid manhattan edges around that entity
  pulse. Urgency is state, not noise: no screen shake, no sound escalation
  before phase-2 audio.
- **Outcomes** — turn clean: brief `moss` flash on the entity edge (200 ms).
  PR merged: `moss` bloom + structure begins `plum` decay and sinks. Error:
  grid around the entity turns hostile — plus-marks to ×-marks in
  `terracotta` for as long as the status holds. Archive: `plum` sink, always
  quiet.
- **Recap** — voyage log as a monospace terminal ledger, hairline
  `ink-faint` rules, category totals right-aligned; RED sessions stamped in
  `terracotta`. Flat throughout: no gradients, no shadows except ship focus.
- **Palette discipline** — `paper` ground, `ink` text, `ink-faint`
  secondary; accents only on state: `indigo` running/agents, `ochre`
  permissions/warnings, `terracotta` attention/errors, `moss` success/merged,
  `plum` archive/decay. No raw hex outside the theme resource.

## Achievements / medals (flavor — grant no points; score-bearing recognition
is rank + streaks only)

- **First Light** — launched your first agent from the ship.
- **Messenger** — answered your first permission.
- **Clean Wake** — one 10-turn chain at max multiplier, zero errors.
- **Terra Firma** — first PR merged from a workspace you piloted to.
- **Salvage Rig** — banked 1,000 pts of cargo in one session.
- **Night Watch** — resolved a permission after its arc hit `terracotta`.
- **Harbor Pilot** — docked with every live workspace in one session.
- **Fleet Spectroscopy** — fleet diversity log at 5 provider/model pairs.
- **Undertaker** — archived 10 workspaces, each sunk clean.
- **Steady Hand** — 30-day day-streak without a negligence break.
- **Icebreaker** — first session with ≥ 5 agents and zero errors.
- **Quartermaster's Coin** — all three daily goals, 7 clean days straight.
- **Dead Reckoning** — completed a session goal across a daemon reconnect.
- **Lighthouse** — restored a provider to ready by `refresh`, twice in a day.
- **Full Rigging** — reached CAPTAIN.

## Open questions — architect rulings 2026-09-10

1. **Permission windows.** 60-min flow floor approved as view-state
   bookkeeping. It is capped at 25% of an approval's max value and explicitly
   labeled non-daemon; re-anchor if the daemon ever surfaces real expiry.
2. **Terminal status vocabulary.** Gb capture item — §2 turn/finish rows stay
   provisional until Gb observes live terminal transitions.
3. **Permission payload shape.** Gb capture item — requires a live agent
   holding a permission.
4. **Denial quality.** Neutral-only tiering for denials approved for phase 1.
   Vindicated-denial detection is speculative until reroute behavior is
   observed; revisit with Gb data.
5. **Schedules.** Gb probe item — subscribe + observe fire events; if
   confirmed, schedules become the phase-2 timer backbone.
6. **PR transition delivery.** Payload-diffing is the design baseline; Gb
   confirms push vs poll and the gateway projection (and point latency)
   adjusts accordingly.
