# Jetstream source checkpoint — 2026-11-26 UTC

This is a development checkpoint, not a production release. The coherent app source at `0901409c938063a8f5d04315943f2594a0d7efea` passed a fresh build, all 130 discovered unit tests, and an actual hidden/no-activation Electron render with an isolated temporary profile. Full combined interaction validation remains pending. This checkpoint was not deployed.

## Included in main

| Work | Snapshot | State |
| --- | --- | --- |
| Existing desktop, navigation, layout, activity, performance, Dev reload and model controls | Existing integration history | Earlier installed releases retained |
| Jetstream branding, title-only navigation and sparse working dots | `d53ba6d` | Installed and independently validated |
| Scrollbar-free reveal and quiet reply composer | `85ddc77` | Integrated; full release gate still open after an intermittent stream fixture cancellation |
| Built-in provider boundary | `550d076` | Integrated with scoped caches, capability gates and hidden second-provider tests |
| Exact-map bare references | `f72a800` | Integrated; optional project prefixes retained through provider projection; no invented code resolver |
| Editable nonsecret settings | `b34c92c`, reconciled as `87b9713` | Integrated with provider hooks; combined interaction validation pending |
| New-thread project/model/options/Captain flow | `22a41af` | WIP checkpoint; targeted checks passed, comprehensive interaction validation pending |
| Pane-local slash find | `c3c4d7` | WIP checkpoint; build/unit/render checks passed, hidden matrix still being completed |
| Canonical directory documentation | `eeab8e0` | Filesystem rename remains a separate operation; compatibility identities unchanged |

## Preserved separately

`jets27-activity-journal` at `511b767bc197256ff946323bf7d151fda27a21bb` preserves the unfinished journal implementation. It is intentionally not merged into main: its renderer calls a not-yet-implemented bootstrap method, so merging it would break startup. It is not runtime-ready.

`jets42-density-grid` at `87b9713a814aedd117cb895d8a173a7cf1fa44f5` contains the reconciled settings prerequisite. Density implementation had no app deltas at the snapshot boundary. The design prototype is not app source and is not published.

Feature owners resumed after their snapshots. Later edits are not implicitly part of these fixed checkpoints.

## Excluded intentionally

The unrelated untracked `SPEC.md`, credentials, environment files, real profiles/configuration, messages, dependency trees, generated bundles, app archives, retained installations, private Drive files and scratch artifacts are excluded. Only audited app source, fixtures, dependencies' lockfile, documentation and this checkpoint manifest are published. The existing repository history is preserved; no force push or branch deletion is used.
