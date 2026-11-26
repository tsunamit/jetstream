# Jetstream Dev

Dev runs alongside the installed stable app. It uses the local Electron development runtime, not a newly signed or installed application. Nothing launches until you run the command or open the launcher.

```sh
cd /Users/ryan/Developer/jetstream
npm run dev
```

In a feature worktree, run the same command from that worktree's app folder instead. Run `npm ci` once if its dependencies are missing. You can also double-click **Jetstream Dev.command** in the source folder. The launcher opens a Terminal process; quitting Dev ends it. It does not replace or quit stable.

- **Separate profile.** The default is `~/Library/Application Support/Capy Terminal Dev/profiles/default`. Use `npm run dev -- --dev-profile=ui` for another isolated profile. The legacy directory is intentional: renaming the product does not move or copy settings or credentials. Each profile permits one Dev process; launching it twice does not activate stable or create another Dev window.
- **Separate connection.** A new Dev profile starts in Mock. Connect live explicitly using its own Connect button and API key. Dev does not copy stable credentials, settings, or transcripts, and ignores inherited `CAPY_API_KEY`. Remember uses macOS secure storage; unavailable secure storage means a session-only connection, never a plaintext fallback. `--live` opens that Dev profile's saved live mode, or offline when it has no usable key. `--demo` forces Mock.
- **CSS saves update in place.** They keep the current renderer, editor focus, selection, draft, and scroll. There is no web server, listening socket, renderer Node access, or relaxed CSP.
- **Renderer saves show an update-ready notice.** Press **Cmd+R** or the Dev reload button intentionally. Reload preserves drafts, selected committed context, navigation history, editor mode/selection/scroll, chat cursor anchors, pane sizes, sidebar state, and tool visibility where the loaded history permits. It does not automatically send messages. Streams reconnect with a fresh renderer token. Read acknowledgments remain paused until intentional keyboard, pointer, or wheel input.
- **Reload has limits.** Finish a send, navigation, resize, editor prompt, or open dialog first. Drafts and reload checkpoints live only in the Dev process's memory; quitting Dev loses unsent drafts. Undo history, open transient dialogs/previews, DOM text selections, and live partial stream previews are not carried across a renderer reload. A deep-history restore refetches at most 30 pages; missing or changed history may prevent an exact cursor/scroll match. If restoration fails, drafts stay available and the notice asks you to choose the thread again.
- **Main, preload, and shared main-process modules need restart.** Quit **Dev only**, then run the launch command again. IPC/security boundaries are never hot-swapped. A build error keeps the current renderer; fix the source and save again. Watchers stop when Dev closes and are excluded from stable packaging. Packaged stable ignores the Dev launch flag.

Hidden validation uses `npm run dev-test && npm run dev-smoke`. The smoke suite creates temporary source/profile fixtures and never activates a visible window. It also opens a separate hidden stable-mode fixture to check coexistence; it never uses the installed app's profile or session.
