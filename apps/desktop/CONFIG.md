# Editable settings

Jetstream reads `~/.config/jetstream/config.json`. Jetstream Dev reads
`~/.config/jetstream-dev/profiles/default/config.json`; `--dev-profile=name`
selects a separate Dev directory. The existing **Capy Terminal** stable/Dev
profile, credential and bundle identities stay where they are.

Open **Keymaps → Open config** to open the file in your editor. Saving valid
JSON applies it without restarting the app. **Reload config** is also available
there. Both commands can be mapped in Keymaps; they start unmapped to avoid
conflicting with existing custom bindings. The settings dialog remains available
through `<leader>,` by default and through its button and native Tab traversal.
Open config never accepts a renderer-supplied path or command. Hidden tests stub
the editor launch and never open an application.

`config.example.json` is a portable starter example; generated files include
platform-specific defaults (including Command+Enter on Mac). `config.schema.json`
describes the shape. Runtime validation also checks known command IDs, native
reserved keys, mode ownership, duplicate/prefix collisions and platform-specific
chords using the same keymap compiler as the app. An empty command array unmaps
that command. Omitted command arrays use the app defaults. Composer editing and
Visual/operator ownership are unchanged.

The config contains only keymaps, pane sizes, centered reading and public tool
visibility. No API keys, tokens, model choices, profiles, history, executable
plugins or remote includes belong here. Private/unsafe field names are rejected,
including inside unknown metadata. Harmless unknown JSON keys are retained by
UI saves but are not interpreted. JSON comments are not supported.

## Migration and errors

Only when the file is absent on first startup, Jetstream copies valid legacy
`keymaps.json` and `layout.json` from its unchanged user-data directory, then
imports the legacy renderer `showToolActivity` preference once. Custom maps,
unmaps, leader, timeout and saved manual sizes are preserved. Existing config
files always win. Legacy files/local storage are not deleted or rewritten.
Invalid legacy files stop migration and show the old file's path, rather than
silently dropping custom settings. Dev migrates only its own Dev profile.
For a legacy shortcut collision, Keymaps exposes the preserved proposed map for
an explicit repair/save. Valid legacy sizes and tool visibility stay intact.
If you fix a legacy file directly instead, restart to retry initial migration,
or create the new config file explicitly; Reload config reads the new path.

A missing new config gets defaults. An existing invalid file is never rewritten:
the last valid in-memory config stays active (defaults on a cold start). The
settings dialog shows the path and JSON line or failing property. Fix the file
and save or Reload config. Deleting the file during a session keeps the current
settings; recreating it is noticed. A UI save can recreate a missing file from
the active settings. It cannot repair malformed JSON by discarding other keys.

## UI saves and file conflicts

UI controls write the same file, not a separate settings store. Saves replace
only the selected section and retain other known/unknown keys. Keymaps save on
submit; resizing saves at drag completion or after a 250 ms keyboard debounce.
Reset defaults changes only keymaps. Reset pane sizes changes only sidebar/reply
sizes, not centered reading or tool visibility. Tool visibility has its own
toggle. These controls do not delete the file or unrelated settings.

The file wins conflicts. Each UI edit carries the content generation it began
with. A save rereads and validates the disk document, rejects stale generations,
and checks disk contents again immediately before atomic rename. Review the
reloaded settings and retry; a stale form is not silently rebased. File events
cancel pending resize/chord work, never drafts, Vim mode, chat selection or
navigation history. A watcher observes the directory so atomic editor renames
and recreation work; changes are debounced 100 ms. App writes use a unique
same-directory temporary file with mode `0600` and atomic rename. This is
optimistic concurrency, not a cross-process file lock: an editor writing in the
tiny interval between the final check and rename can still race, so avoid
simultaneously saving from the UI and editor.

Unpackaged Dev can explicitly use `--config-file=/absolute/path/config.json`.
Stable/packaged launches reject this override. Hidden tests always use their
temporary user-data directory unless explicitly given another temporary path.
No normal test reads or writes the real config or opens an editor.
