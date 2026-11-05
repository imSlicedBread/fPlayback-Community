# Changelog

## v1.7.14 — 1080p preference, station warning and optional Twitch restart

- Prefer standard 1080p on the YouTube watch page, use available lower-quality fallbacks, and display actual decoded video height.
- Show a prominent station connection warning even with output auto-start disabled. Pause, hide and silence disconnected output; reconnect at the station checkpoint.
- Add a saved, off-by-default main Twitch stream restart option: stop at 47h55m, wait two minutes, then reconnect. Include cancellation, service checks and bounded failure handling.
- Ship plugin/installers 0.1.12 for OBS 32.2.2 and 33.0.0; update setup documentation and add quality and accelerated restart-policy tests. No database migration.

## v1.7.13 — overlay title sync

- Hold the outgoing overlay title until the next video finishes its 300 ms crossfade in the native OBS output.
- Validate readiness against the current worker, video ID and queue generation; ignore stale reports and retain compatibility with older outputs.
- Ship plugin/installers 0.1.11 for OBS 32.2.2 and 33.0.0. Update both station and plugin; no database migration.
- Verify live Next/Previous title timing in OBS 33 and add automated readiness, revocation and privacy coverage.

## v1.7.12 — OBS 33 support, crash recovery and memory fixes

- Ship separate plugin/installer 0.1.10 targets for OBS 32.2.2 / CEF 127 and OBS 33.0.0 / CEF 150, preserving ad filtering, browser context and queue controls.
- Add bounded renderer-crash recreation, generic player-error recovery, runtime diagnostics and installer runtime validation.
- Expire/cap output acknowledgements and title lookup history/cache; tighten browser callback cleanup and diagnostic network buffers.
- Add five-minute resource logging, real renderer-crash and 50-cycle browser tests, plus cache churn and simulated long-uptime coverage.
- No database migration; update the station and install the plugin matching OBS. Multi-day resource use and live OBS 33 members-only access remain unverified.

## v1.7.11 — Recycled sorting UI cleanup

- Show Upcoming sorting only on Upcoming and Recycled sorting only on Recycled.
- Guard sorting actions against an inactive lane and refresh the dashboard script cache version.
- Preserve saved Recycled ordering, automatic insertion and plugin/installer 0.1.9. No database migration or plugin reinstall is needed.

## v1.7.10 — ad filtering and output interaction

- Package OBS plugin and installer 0.1.9 with experimental request filtering in the existing signed-in OBS Chromium profile.
- Block known ad URLs and remove recognized player ad data before playback; retain access checks, media URLs and queue controls. Disable black ad masking while filtering is enabled.
- Add temporary Interact / Finish interaction controls without unlocking output resolution. End interaction on park, stop and restart.
- Restore full-window layout around Premium marketing prompts while retaining manual access/content confirmations.
- Add real Chromium acceptance coverage for filtering, account-cookie continuity, controls and shutdown, plus interaction regression tests.
- Require the matching OBS 32.2.2 Chromium runtime; no database migration.

## v1.7.9 — Recycled sorting and optional ad masking

- Sort the entire Recycled lane by title or VOD date in the title; save the order and apply it to additions, moves, imports and completed videos. Undated titles go last; manual reordering disables automatic sorting.
- Allow direct additions and imports to Recycled without starting playback.
- Merge the successful Ad Guard candidate and store its source directly in the plugin files.
- Plugin 0.1.8 adds a saved, optional (off by default) setting to hide detected ad video and mute ad audio in the native OBS source.
- Hold queue position during ads and resume content after readiness; keep ad suppression separate from the transition timeout.
- Observe player ad markers between station polls, reapply browser muting during ads, and detach observers on generation changes and stop.
- Retain the Windows installer resource-path build fix and add Ad Guard regression coverage.
- Package plugin and installer 0.1.8. No database migration is required.

## v1.7.8 — Windows startup lock handling

- Handle Windows EPERM during the existing-process check without an uncaught stack trace. Preserve the lock when the process cannot be inspected.
- On a second interactive launch, check the configured local port and open an existing healthy Playback dashboard. Never start a second writer or remove the running station lock.
- Show actionable startup errors when the existing dashboard is unavailable. Background startup stays headless.
- Add regression coverage for permission denial, live and exited process IDs, unexpected probe errors, duplicate launches and dashboard health validation.
- OBS plugin and installer remain at 0.1.7; no plugin reinstall or database migration is required.

## v1.7.7 — tidier app folder

- Move storage documentation, build reports, historical performance measurements and release notes into `docs/`.
- Update README links and release packaging to use the new documentation paths.
- Keep startup shortcuts in the main folder and preserve local data, backups and existing release artifacts.
- OBS plugin and installer remain at 0.1.7; no plugin reinstall or database migration is required.

## v1.7.6 — process and resource cleanup

- Stop output now closes its browser/window, releases capture buffers and disables browser audio capture. Start recreates the output using the saved account session and placement.
- Cancel pending native requests and retries on stop; clean up the output before OBS tears down its scene sources and browser framework.
- Bound HTTP shutdown, abort background work before draining connections, and make cleanup idempotent.
- Cancel an extractor's owned process tree and wait for its exit, without terminating unrelated processes. Already-cancelled work cannot spawn a process.
- Test stalled HTTP clients, extraction cancellation, child-tree isolation, lock release, and natural station process exit. Live OBS Stop/Start and full exit leave no tracked OBS/browser processes behind.

- Package plugin and installer 0.1.7.

## v1.7.5 — smoother transitions and pause without rewind

- Hold the outgoing OBS source frame while the next queued video loads, then crossfade into its decoded picture over 300 ms. Preserve normal audio routing.
- Require the player and video to fill the output viewport with a stable layout for 500 ms before releasing the fade. Watch YouTube style changes and withdraw readiness if its layout changes again.
- Mark pause/resume generations as transport-only so the native output pauses at its live frame without rewinding to a stale progress checkpoint.
- Reveal ads and access prompts immediately when reported; stop holding after 15 seconds if loading never becomes ready. Cancel stale transitions on stop, sign-in, or rapid queue changes.
- Add transition-policy and D3D11 pixel tests, plus controller readiness and access-prompt coverage.

- Package plugin and installer 0.1.6.

## v1.7.4 — prioritize the saved playback position

- Include the local queue checkpoint in the native watch-page URL.
- Guard against delayed browser-history resume during startup before reporting progress or completion. Hold pending seeks and reapply the checkpoint after ads/access prompts. Preserve dashboard seek/replay and later manual interaction.
- Add regression tests for zero/paused positions, late history jumps, false completion, pending seeks, and post-ad resumption.
- Package plugin and installer 0.1.5.

## v1.7.3 — restore OBS windows after restart

- Register the dock before OBS restores its layout; start playback after OBS finishes loading.
- Keep floating dock title bars on-screen.
- Save output position and parked state on normal shutdown and restore them at startup, retaining render resolution and accounting for available monitors.
- Hide the channel watermark while output is locked, restoring original styles for manual interaction, ads and access prompts.
- Package plugin and installer 0.1.4.

## v1.7.2 — cleaner OBS dock

- Remove the experimental watch-page and sign-in introduction from the OBS dock.
- Package plugin and installer 0.1.3; retain output lock, resolution settings and existing playback behavior.

## v1.7.1 — OBS output lock and resolution settings

- Add saved 720p, 1080p, 1440p and 4K render presets plus Match OBS canvas, applied explicitly from the dock while keeping playback locked. Account for display DPI and keep native source pixel dimensions stable. YouTube stream quality remains automatic.
- Package the change as plugin/installer 0.1.2.

## v1.7.0 — OBS plugin installer and automatic setup

- Lock output size and mouse/keyboard interaction during playback, hide ordinary player transport controls, and park the locked window on Close. Provide explicit manual unlocking for YouTube interaction; preserve ads and access dialogs.

- Add a standalone Windows plugin installer with OBS detection, a folder picker, compatibility checks, verified replacement, backups and rollback. Bundle corresponding plugin/installer source and license in the executable; no PowerShell or .NET setup is required.
- Rename the OBS dock to fKey Playback while preserving its internal identifier.
- October 20, 2026: the user confirmed actual members-only video playback in the native OBS plugin with a signed-in, entitled YouTube account. The separate embedded Browser Source workflow remains unverified for members-only playback.
- Update the dashboard sidebar with fKey branding, an OBS Plugin Setup guide, a safe overlay preview link, and the running server version.
- Add or repair the transparent overlay with the existing Add Playback source action, using the station port and OBS canvas dimensions. Reuse manual and managed sources, keep existing video transforms, and avoid modifying unrelated Browser sources.
- Keep the captured window rendering when minimized by parking it outside the virtual desktop, with explicit restoration for account interaction. The window must remain open.
- Add native libobs scene-setup coverage for creation, repeated use, ordering, name collisions, dimensions and port changes.

## v1.6.1 — correct startup and health version reporting

- Read the runtime version from package.json for both the startup banner and health endpoint, removing stale 1.5.1 strings.
- Verify both outputs against the package version in the real headless startup test.
- Retain the v1.6.0 OBS plugin, audio fix and watchdog; the plugin binary is unchanged.

## v1.6.0 — experimental OBS YouTube output, audio and watchdog

- Add a playback watchdog: recover 10-second stalls and 30-second startup waits at the saved queue position. Respect paused playback, votes, ads, blocked autoplay and access dialogs. Bound reloads to three per five minutes with a cooldown and a manual-retry hold.
- Capture audio from this OBS instance's browser subprocesses into the native Playback source. Upgrade video-only sources to Track 1 once, reconnect after browser-process changes, and stop capture when the source is inactive.
- Add a Windows native OBS dock and normal YouTube watch-page output, with manual sign-in using OBS Browser's default session. Connect queue, seeking, audio, voting and completion through the existing local worker lease; account barriers hold playback. Membership access remains unverified.
- Add a native Playback video source using OBS's Windows Graphics Capture library, optional start with OBS, explicit worker release, and a transparent `/overlay` for lower thirds and votes without a second playback controller. Standard Window Capture excludes OBS-owned windows.
- Live OBS tests confirmed saved YouTube sign-in, public-video picture, restart startup, pause/seek/resume, progress and automatic end-of-video advancement. Native browser audio was verified as non-silent PCM and a moving OBS mixer meter after restart. Restricted prompts remain manual; members-only access still needs validation.
- Include plugin source, pinned checksum-verified build tooling and Windows build instructions. Native rendering and actual members-only access require live OBS acceptance.

### OBS Browser Source account mode

- Added a saved, opt-in OBS account-playback setting using the regular YouTube embed host, with default public playback unchanged.
- Added sign-in/setup instructions for the existing OBS Browser Source; no extension or Window Capture setup is required.
- Hold account-mode errors with Retry/setup controls instead of automatically quarantining or skipping the video. Preserve normal queue, audio, lower-third and voting controls.
- Removed the unreleased Chrome extension/controller, build, release packaging and profile-specific startup setup.
- Enforce account-mode error holds on the server as well, including errors sent by cached older players; explain YouTube age-restricted embedding limitations.
- OBS Google sign-in and private-playlist listing were observed locally. Account-restricted embedded playback, members-only videos and reboot persistence remain unverified.

## v1.5.1 — unattended Windows startup and OBS recovery

- Added optional OBS launch after the backend becomes healthy at Windows sign-in.
- Added an explicit 30-day remembered dashboard login using a signed HttpOnly cookie, without saving the operator token in the browser.
- Retry failed YouTube API/iframe startup and unstarted playback while preserving pause and saved positions; ignore stale iframe callbacks and startup progress.
- Documented reboot setup and OBS source settings. Actual workstation reboot/OBS acceptance remains required.

## v1.5.0 — Kick and independent SOOP admin readers

- Added separate Kick and SOOP connections and private whitelists under Chat Connections, disabled by default.
- Reused one admin dispatcher across Twitch, Kick and SOOP with platform-scoped identities/deduplication and a shared station rate limit/activity list.
- Added fStream-style outbound Kick Pusher reading and a receive-only SOOP protocol adapter, with independent localhost OAuth setup and local token renewal.
- Preserved Twitch viewer commands and existing settings when older dashboard tabs save.
- Added simulated transport, identity, cancellation, OAuth renewal, private HTTP persistence, and Settings tests. All 135 tests and JavaScript syntax checks pass locally on Windows. Live Playback provider verification is still pending.

## v1.4.0 — Twitch chat admin whitelist

- Added an operator-managed Twitch username whitelist in Settings → Twitch Chat, empty by default and private to authenticated operators.
- Added privileged playback, seek, audio, and direct video-adding commands while preserving viewer voting, skip votes and moderated requests.
- Require explicit whitelist membership and a numeric Twitch sender identity; moderators and broadcasters receive no automatic access.
- Ignore commands forwarded from other Shared Chat rooms and repeated message IDs; enforce account and station rate limits.
- Show the latest 20 authorized command attempts and results in Settings without sending chat replies or retaining ordinary messages.
- Preserve unsaved Settings edits during activity polling and retain the whitelist when older dashboard clients save unrelated settings.
- Added connector, HTTP, persistence, failure-recovery and Settings controller tests. All 123 tests pass locally on Windows.

## v1.3.1 — Large queue moves with progress

- Move selections exceeding 500 videos via automatically acknowledged 250-item batches; server preserves the 500-item per-transaction safety limit.
- Added Select all matching in lane (including all matching videos across queue pages), with count and batch progress, cancellation after the current batch, and partial-failure feedback.
- Moved entries are deselected only after their batches are committed; unmoved entries remain selected for retry.
- Optimized per-batch queue moves from repeated per-ID scanning to a single lookup and source-lane filter, improving performance on 10,000+ queues.
- Preserved SQLite migration, saved playback progress and OBS output behavior.


## [1.3.0] — SQLite storage and queue capacity

- Removed the fixed queue capacity and the startup slice that silently truncated queues above 2,000 entries.
- Added transactional, indexed SQLite persistence; frequent runtime checkpoints do not rewrite the catalog.
- Preserved ordering positions across normal completion/removal so unchanged queue rows need not be rewritten.
- Added automatic one-time JSON migration with an exact pre-migration backup, safe failure behavior and no change to saved playback schema version 2.
- Added consistent database backups and a repeatable storage benchmark.
- Added tests for 10,000-entry imports/reloads, all-lane migration, injected rollback, abrupt process termination, live backups and large-library HTTP controls.
- Retained 50-row paging and separate per-request/moderation limits.

## [1.2.4] — 2026-10-16

- Bounded 50-row queue pages, whole-lane search and cross-page selection.
- Revision-based catalog delivery and compact live polling for dashboard, OBS and Settings.
- Single-flight refreshes and hidden-tab polling suspension.
- Reuse unchanged Now Playing, vote, suggestion and theme DOM; lazy thumbnails.
- One-pass metadata scheduling and smaller durable snapshot encoding.
- Added large-queue, cache invalidation, rollback, paging, authenticated compact API and request-coalescing regression tests.


## [1.2.3] — 2026-10-16

- Fixed queue-row Move dropdowns closing during the regular 1.3-second operator dashboard refresh.
- Reconciled existing rows by durable queue-entry ID and updated metadata without unmounting active inputs.
- Preserved pending move choices and checkbox selections while polling.
- Kept action callbacks bound to current queue indices after reordering.
- Added automated regression tests and versioned UI assets to bypass cached client code.

## [1.2.2] — 2026-10-16

- Added adjustable OBS lower-third background opacity (0–100%, default 89%), without dimming video titles.
- Added explicit lower-third height (Auto or 4–65% of the OBS frame), preserved in the authoritative settings state.
- Added diagonal corner resize in the editor, with keyboard width/height editing and anchor-aware handle placement.
- Redesigned the editor as a responsive 16:9 canvas and side inspector with grid and safe-area guides.
- Preserved old saved layouts as Auto Height with previous opacity; updates persist and sync to the OBS Browser Source.
- Added validation, API persistence, WYSIWYG renderer and responsive Chromium tests.

## [1.2.1] — 2026-10-16

- Clear the YouTube playlist preview, selections, playlist URL, and starting index after a confirmed queue import so the importer is ready for another playlist.
- Preserve the success message and importer preferences. Retain preview and selection if an import fails.
- Align vertical anchor, snap controls and lower-third reset on a full-width responsive four-column settings toolbar.
- Bump versioned UI assets to prevent stale cached styling.

## [1.2.0] — 2026-10-16

- Added durable Play Next, Upcoming, Recycled and Next Rotation lanes with automatic rollover.
- Preserved old queue/playhead during schema v1 to v2 migration, with a pre-migration backup.
- Integrated lane-aware OBS voting, history, play-next/now, moving, bulk actions, sorting, shuffle and importer destination controls.
- Added a prebundled, checksum-verified official yt-dlp.exe to Windows GitHub release ZIPs, with third-party notices and source links.
- Added rotation/voting/restart/security and bundle packaging tests.


## [1.1.0] — 2026-10-16

- Added authenticated YouTube playlist URL extraction and selectable preview.
- Import up to 500 playlist entries per batch in playlist order, with a start index for larger playlists.
- Added duplicate suppression for videos already playing, in the queue or repeated in a playlist.
- Added Copy Selected URLs and Export Selected CSV actions, with spreadsheet formula injection hardening.
- Added bounded `yt-dlp` metadata extractor (no API key), with official YouTube Data API v3 alternative.
- Added timeouts, URL validation, extraction concurrency limit, ephemeral previews, and atomic queue imports.
- Preserved the current video/playhead and preexisting settings.


## [1.0.9] — 2026-10-16

- Added independent OBS lower-third visibility switches for channel label, “NOW PLAYING”, duration and skip counter.
- Defaulted to a compact title-only lower third, retaining old positioning and color settings.
- Added a 50–300% video-title text-size slider, separate from whole-overlay scaling.
- Matched live editor preview and OBS output rendering, including collapsed rows and long-title ticker refresh after settings changes.
- Validated settings at the API boundary, checkpointed changes across restarts and added new automated regression tests.


## [1.0.8] — 2026-10-16

- Added unattended Windows AtStartup scheduled task running as LOCAL SERVICE, not SYSTEM.
- Added installer, uninstaller, status helper, and headless boot entrypoint with bounded persistent logs.
- Added optional dashboard opener at Windows sign-in, health-gated to avoid duplicate /player instances.
- Retires the previous sign-in-only fKeyLabs Playback task when boot startup is installed.
- Added startup tests and Windows PowerShell script syntax checks.


## v1.0.7 — transport placement correction

- Centered Previous / Pause / Replay / Next horizontally at the specified X, across the full Now Playing panel.
- Kept Jump to seconds in a separate row and added versioned dashboard CSS/JS assets to avoid stale styles.

## v1.0.6 — automatic dashboard browser opening

- Restored automatic default-browser launch of the operator dashboard when starting the interactive Windows batch launcher.
- Added macOS/Linux interactive launcher support with headless Linux detection.
- Open the dashboard **only after the server binds**, using the actual listening port; do not open the OBS player or create a second playback worker.
- Preserve unattended startup via `ops/start-player-supervised.bat` and `npm start` without launching a browser.
- Support `PB_OPEN_BROWSER=0` to disable automatic opening; browser-launch failure never terminates the server.
- Added cross-platform launch command, opt-in, failure and launcher-configuration tests.

## v1.0.4 — YouTube volume and mute controls

- Added a **0–100% YouTube volume slider** and **Mute / Unmute** button directly below Now Playing's seek bar.
- Persisted volume and mute independently of video playback, settings edits and queue state; restored them after restarting.
- Connected volume and mute to the OBS source's official YouTube IFrame API (`setVolume`, `mute`, `unMute`).
- Added operator authorization and strict volume validation, plus HTTP integration, persistence, YouTube API and offline Chromium tests.
- Preserved the official Playback logo, interactive seek bar and automatic YouTube title recovery.

## v1.0.3 — sidebar cleanup and interactive seek bar

- Removed redundant “fKey” from the sidebar label; the official f-keycap logo and the company credit remain.
- Restored the draggable, clickable, keyboard-accessible seek bar in the operator dashboard with elapsed and total time.
- Prevented polling updates from interrupting an in-progress seek operation.
- Retained precise jump-to-seconds, the saved playhead, title metadata recovery, and OBS output synchronization.


## v1.0.2 — official logo update

- Replaced the placeholder brand icon with the official fKey Playback logo provided by the project owner.
- Updated Control, Settings, Viewer Voting, auth screens, and browser tab icons to use the official logo.
- Version bump for a fresh GitHub release.


## [1.0.1] — 2026-10-16

- Fixed missing YouTube titles in the OBS lower third when a video was added by URL alone.
- Added best-effort, bounded YouTube oEmbed metadata lookup for the queue and viewer requests, requiring no YouTube API key.
- Enabled the active YouTube iframe to report its loaded title with its video ID and playback generation, protecting against stale/wrong-video titles.
- Persisted recovered titles in the video library, vote cards and history across restarts while preserving manually entered titles.
- Remeasure long-title scrolling after lower-third visibility changes and browser resizes.
- Updated branding to **fKey Playback**, made by **fKey Labs Inc.**


## [1.0.0] — 2026-10-16

Initial GitHub release of the standalone Playback broadcast-station implementation.

### Added

- Local OBS YouTube playback with a dedicated browser-source player.
- Durable queue, position, history and voting checkpoint recovery.
- Operator token authentication, origin checks and scoped worker leases.
- Queue playback controls and moderated video suggestions.
- 2 × 2 end-of-video vote screen, Twitch IRC votes and skip commands.
- Tabbed settings, custom colors, scrolling titles and CC suppression attempts.
- Lower-third drag/resize, top/bottom anchoring and output layout acknowledgements.
- Windows launcher, service-supervision helpers, Linux/macOS launcher and health endpoint.
- Automated syntax, integration and state-machine tests.

### Validation caveat

17 automated tests passed in the initial development build. The YouTube IFrame,
real Twitch chat, and OBS browser rendering still need live verification on the
deployment machine. The application is intended for a local streaming station,
not as a publicly accessible web service. Do not assume uninterrupted playback
without a running browser-source worker.
