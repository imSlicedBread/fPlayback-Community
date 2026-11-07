# fKey Playback v1.7.16 — OBS 33.0.1 installer

The Windows x64 **OBS 33** installer **0.1.13** now accepts **OBS 33.0.1** and **33.0.0**. It checks for Qt 6.11.1 and CEF 150.0.20 before copying files. OBS 32.2.2 uses its own installer.

## Downloads

- **Playback-v1.7.16.zip** contains the station and bundled yt-dlp.
- **fKey-Playback-OBS-Plugin-Setup-0.1.13-OBS33.exe** installs the plugin for OBS 33.0.0 or 33.0.1.
- **fKey-Playback-OBS-Plugin-Setup-0.1.13.exe** installs the plugin for OBS 32.2.2.
- The plugin ZIPs contain the matching installer, DLL, source and licenses. SHA-256 checksums accompany the downloads.

Close OBS before running the plugin installer. When updating the station, stop Playback and its startup task and preserve `data/` and launcher configuration before extracting the ZIP.

## Verification

The installer passed validation, install, upgrade and rollback tests using OBS 33.0.0 and 33.0.1 runtime files and temporary install folders. Each native OBS build passed 11 tests. The station test suite passed 198 tests with one skip.

---

# fKey Playback v1.7.15 — visible OBS auto-start

When Windows auto-start launches OBS after sign-in, it now opens the main OBS window visibly. The launcher still waits for a healthy Playback station before opening the dashboard and OBS, and avoids opening a duplicate OBS process. Previously OBS could be running with its main window hidden.

## Upgrade

- Stop Playback and its startup task, preserve `data/` and launcher configuration, then extract **Playback-v1.7.15.zip** into the existing station folder and restart the station.
- Existing startup tasks reference the updated script in place. If startup is not installed, or you moved the folder, run **INSTALL-AUTO-START.bat** and choose **Y** to open OBS after Playback is ready.
- Keep **Start this output when OBS opens** enabled in the fKey Playback dock to resume queued video automatically.
- Plugin/installers **0.1.12** for OBS 32.2.2 and OBS 33.0.0 are unchanged from v1.7.14 and included again for convenience. Users already on 0.1.12 do not need a plugin reinstall. No database migration is required.

## Verification

Syntax checks and the full local app suite pass: **198 passed, one platform-specific skip**. All four Windows startup checks pass, including a regression assertion that OBS launches with normal window visibility only after the station health check.

The real scheduled tasks were exercised locally: the sign-in launcher waited while Playback was stopped, the boot task started v1.7.14 under **LOCAL SERVICE**, and OBS started after the station was healthy. After correcting visibility, a clean sign-in-task launch opened OBS 33 visibly and resumed the saved video at **1080p** with active audio. The queue and saved position were preserved. This was a scheduled-task execution test, **not a complete Windows reboot/sign-in test**. The tested launcher is unchanged except for this release's metadata.

The release contains the station ZIP and SHA-256 checksum plus the unchanged OBS 32/33 installers, plugin ZIPs and their checksums. Earlier 1080p, station warning, optional Twitch restart, ad filtering and recovery behavior remains included. See v1.7.14 below for test limits, including the untested live 48-hour Twitch restart.

---

# fKey Playback v1.7.14 — 1080p, station warnings and optional Twitch restart

Update **both the station and OBS plugin 0.1.12**, choosing the installer matching OBS **32.2.2** or **33.0.0**. No database migration is required; preserve `data/` and launcher configuration, close OBS before installing the plugin, and stop the station/startup task before extracting the station ZIP.

## Changes

- **1080p preference:** request standard 1080p from the normal YouTube watch-page player, fall back to the best available lower quality, and recheck late-arriving quality options. The dock shows the actual decoded video height. This is separate from output resolution: select **1920 x 1080** and Apply for a full HD OBS source. Bandwidth, source availability and YouTube watch-page changes can still affect quality. IFrame Browser Source quality remains controlled by YouTube.
- **Missing station warning:** show a red **PLAYBACK STATION NOT RUNNING** banner and open the dock when the station is missing or unreachable. Checks also run with output auto-start off. Instructions point to `start-player.bat`; OBS alone does not launch the station. A lost connection pauses and hides video and silences source audio until valid station/queue connectivity returns.
- **Optional Twitch restart:** the saved **Restart Twitch stream before 48h** option is **off by default**. It stops the main OBS Twitch stream at **47h55m**, waits **two minutes after stopping**, and starts it again while the Playback queue continues. The gap exceeds Twitch's documented 90-second disconnect-protection window. Start the initial stream manually. Other services and multistream plugin outputs are not controlled. Manual stops stay stopped; disabling the option, stopping output, changing service/profile or exiting OBS cancels pending restarts. Failed stop/start operations are bounded and require attention rather than retrying indefinitely.
- Preserve overlay title sync, saved checkpoints, signed-in OBS browser context, queue controls, experimental ad filtering and browser recovery.

## Downloads

- **Playback-v1.7.14.zip** — station, source, tests and documentation.
- **fKey-Playback-OBS-Plugin-Setup-0.1.12.exe** — OBS 32.2.2 installer.
- **fplayback-youtube-0.1.12-windows-x64.zip** — OBS 32 plugin, installer, corresponding source and licenses.
- **fKey-Playback-OBS-Plugin-Setup-0.1.12-OBS33.exe** — OBS 33.0.0 installer.
- **fplayback-youtube-0.1.12-OBS33-windows-x64.zip** — OBS 33 plugin, installer, corresponding source and licenses.
- SHA-256 checksums accompany all downloads.

## Verification and limits

Syntax checks and the full app suite: **198 passed, one platform-specific skip**. Each OBS build runs **11 native tests**, including the accelerated stream restart policy. Quality tests cover 1080p preference, lower-resolution fallback, late metadata, bounded retries, Interact, ads, access barriers and unavailable/changing APIs. Restart policy tests cover the time boundary, offline gap, manual stops, disabled/other-service states, cancellation, unready output, timeouts and long uptimes.

Local OBS 33 showed actual **Video: 1080p**, with output saved at 1920 x 1080 and active audio. Missing-station startup and active disconnect/reconnect were verified: a warning opened the dock, disconnected output went black/silent, and the saved video resumed after the station returned. The Twitch restart checkbox was verified unchecked; **no live Twitch stream was started or restarted for testing, and a real 48-hour run remains untested**. Existing members-only, experimental ad-filtering and multi-day memory limits from v1.7.12 still apply.

References: [Twitch broadcasting guidelines](https://help.twitch.tv/s/article/broadcasting-guidelines) and [Disconnect Protection](https://help.twitch.tv/s/article/Disconnect-Protection).

---

# fKey Playback v1.7.13 — overlay title sync

The overlay now keeps the outgoing video's title while the native OBS output holds its frame. It changes to the incoming title after the 300 ms video crossfade, rather than when the queue advances.

Update **both the station app and OBS plugin 0.1.11**. Choose the matching Windows x64 installer: OBS **32.2.2** uses the standard installer; OBS **33.0.0** uses **-OBS33**. Existing signed-in browser sessions, queue controls, ad filtering and recovery remain in place. No database migration is required.

## Downloads

- **Playback-v1.7.13.zip** — station app, source, tests and documentation.
- **fKey-Playback-OBS-Plugin-Setup-0.1.11.exe** — OBS 32.2.2 installer.
- **fplayback-youtube-0.1.11-windows-x64.zip** — OBS 32 plugin, installer, corresponding source and licenses.
- **fKey-Playback-OBS-Plugin-Setup-0.1.11-OBS33.exe** — OBS 33.0.0 installer.
- **fplayback-youtube-0.1.11-OBS33-windows-x64.zip** — OBS 33 plugin, installer, corresponding source and licenses.
- SHA-256 checksums accompany all downloads.

Close OBS before installing. Stop Playback and its startup task before extracting the station update; preserve `data/` and launcher configuration. Restart the station and OBS afterward.

## Verification

Syntax checks and the full app suite pass: **195 passed, one platform-specific skip**. The new regression test covers outgoing-title retention, fade completion, stale/wrong-video readiness, worker ownership, title discovery, Previous, lease expiry and public-response privacy. Both OBS plugin builds and native tests are checked for this release.

Live OBS 33 Next and Previous testing, including a local output recording, confirmed that the old title remains during loading and the incoming title appears after the crossfade. Video/audio resumed, and the original playback position was restored. Slower network loading can still hold the outgoing frame longer; this change does not preload the next video. Existing ad-filtering, members-only and long-duration memory-testing limitations from v1.7.12 still apply.

---

# fKey Playback v1.7.12 — OBS 33 support, crash recovery and memory fixes

Update both the station app and the plugin. Plugin **0.1.10** now has separate Windows x64 builds for **OBS 32.2.2 / Chromium 127** and **OBS 33.0.0 / Chromium 150**, both with Qt 6.11.1. Use the **-OBS33** installer only for OBS 33.0.0. Installers reject the wrong OBS/Qt/CEF version before replacing files, and the running plugin retains its API-hash check. Neither installer changes OBS's Chromium files or account data.

## Changes

- Preserve experimental ad-request/player-data filtering, the existing OBS global browser account context, Playback queue controls, output resolution/lock, overlay setup and Interact in both builds. OBS itself owns login-profile migration during an upgrade.
- Detect renderer termination and recreate only Playback's browser at the saved station checkpoint, with the same output window and normal paused/voting controls. Recovery shares the existing three-attempts-per-five-minutes budget for the current video; Stop invalidates pending retries. Full OBS-process crashes cannot be recovered by its plugin.
- Retry YouTube's recognized English “An error occurred. Please try again later” player screen after 30 seconds without reporting an error position or completing/skipping the queue entry. Membership, sign-in, age and content prompts remain manual.
- Remove expired output acknowledgements and cap retained records at 256. Bound title-lookup cache/history to 5,000 entries while retaining titles saved in the queue.
- Bind queued browser callbacks to widget lifetime, stop closed-browser deadline tasks, remove an unused full request-event capture, and cap Chromium diagnostic network buffers at 1 MiB.
- Log whole-OBS private/working memory, handles, pending HTTP count and plugin uptime every five minutes during playback; log renderer exit codes and detected runtime incompatibilities separately. Whole-OBS memory includes other plugins and is not a GPU-memory measurement.

## Downloads

- **Playback-v1.7.12.zip** — updated station app, tests, plugin source and documentation.
- **fKey-Playback-OBS-Plugin-Setup-0.1.10.exe** — OBS **32.2.2** installer.
- **fplayback-youtube-0.1.10-windows-x64.zip** — OBS 32 installer, DLL, corresponding source and licenses.
- **fKey-Playback-OBS-Plugin-Setup-0.1.10-OBS33.exe** — OBS **33.0.0** installer.
- **fplayback-youtube-0.1.10-OBS33-windows-x64.zip** — OBS 33 installer, DLL, corresponding source and licenses.
- Every download has a SHA-256 checksum. Future OBS patch/runtime builds are not automatically claimed as tested.

Stop Playback and its startup task, back up and preserve `data/` and launcher configuration, extract the station update, and restart it. Close OBS before running the matching plugin installer. Existing plugin files are backed up. If moving the station folder, rerun `INSTALL-AUTO-START.bat`. No database migration is needed. Node.js 22.13+ is required.

## Verification and limits

Syntax checks and the full app suite pass locally: **194 passed, one platform-specific test skipped**. Each OBS target passes **10 native tests**, including real Chromium filtering, cookie continuity, pause/resume/seek, Premium layout recovery, a deliberate isolated renderer crash, 50 browser lifecycle cycles, child-process cleanup, GPU fade/scene fixtures and installer checks.

The separate portable OBS 33 host test loaded the plugin against Chromium 150 and reported real video progress. Pause held position, seek landed at 120 seconds while paused, and resume advanced again. It used a fresh isolated profile; **live entitled members-only playback on OBS 33 remains unverified**. Tests preserve a synthetic account-context cookie across recreation/crash, not a live Google membership entitlement. Live visual output/audio/overlay verification on the affected user's OBS 33 setup is still needed.

The short memory fixture did not show runaway growth, but uses synthetic video state with GPU disabled. It does **not** rule out multi-day YouTube, decoder, driver or GPU leaks. The reported original 135-hour failure remains unconfirmed; supplied follow-up logs showed an OBS 33 runtime change and graphics-device resets. The new recovery and diagnostics should not be described as a confirmed fix for that original cause.

Ad filtering remains experimental targeted YouTube filtering, not the complete AdGuard engine or guaranteed ad coverage. See `docs/OBS33-COMPATIBILITY.md` and `docs/MEMORY-AND-CRASH-RECOVERY.md` for evidence and limitations.

---

# fKey Playback v1.7.11 — Recycled sorting UI cleanup

The Recycled tab now shows its own **Sort all Recycled + save order** controls without the unrelated **Apply to Upcoming** row. Upcoming sorting appears only on Upcoming. Sort actions also check the active lane, preventing a stale or hidden control from changing another queue.

Recycled sorting still covers the entire lane, saves title A–Z or VOD-date ordering, and places new entries in that order. This release changes the dashboard UI only; queue ordering behavior and OBS plugin 0.1.9 are unchanged.

## Downloads and upgrade

- **Playback-v1.7.11.zip** and its SHA-256 checksum — updated station app, source, documentation and tests.
- Plugin installer **0.1.9** and plugin ZIP are the unchanged downloads from v1.7.10, with their checksums.

Stop Playback and its startup task before updating. Preserve `data/` and launcher configuration, extract the update, then restart the station and refresh the dashboard. If moving the app folder, rerun `INSTALL-AUTO-START.bat`. No database migration or plugin reinstall is required for existing plugin 0.1.9 users.

## Validation

JavaScript syntax checks and the full existing app suite pass locally (191 passed, one platform-specific check skipped). GitHub CI verifies Windows and Linux before publication. Dashboard JavaScript uses a new cache version so the cleanup loads after refreshing.

---

# fKey Playback v1.7.10 — ad blocking and Interact button

Plugin 0.1.9 adds **Block ads before playback (experimental)**, enabled by default. It filters known YouTube ad delivery URLs and recognized ad-placement data before playback in OBS's existing Chromium runtime, using the same signed-in profile. Playback queue controls, saved positions and audio routing remain available. Ad masking is disabled while request filtering is enabled, avoiding an added black-screen hold for missed ads.

The fKey Playback dock now has **Interact with output** and **Finish interaction**. Temporarily enable YouTube mouse/keyboard controls while keeping the selected output size and full-window layout. Interaction ends on park/close, stop, queue start or restart. Controls visible during interaction can appear on the broadcast. Premium marketing prompts no longer hold the player in the smaller watch-page layout; genuine access and content confirmations remain manual.

## Downloads and upgrade

- **Playback-v1.7.10.zip** — station app, tests, documentation and plugin source.
- **fKey-Playback-OBS-Plugin-Setup-0.1.9.exe** — Windows plugin installer.
- **fplayback-youtube-0.1.9-windows-x64.zip** — installer, plugin DLL, corresponding source and licenses.
- Each asset has a SHA-256 checksum.

Stop Playback and its startup task before updating the station. Back up and preserve `data/` and launcher configuration. Close OBS, run the 0.1.9 installer, then restart OBS. No database migration is required. If moving the station, rerun `INSTALL-AUTO-START.bat`. Requires Node.js 22.13+; the plugin requires Windows x64, OBS 32.2.2 / Qt 6.11.1 and its matching Chromium 127.145.7 runtime. The plugin checks the exact runtime/API hash before creating its browser. Other OBS builds are not verified.

## Validation and limits

JavaScript syntax checks and the app suite pass (191 passed, one Linux-only check skipped locally). All nine native tests pass. Real Chromium fixtures verify request blocking, HTML/API ad-data rewriting, cookie continuity, unchanged access/media data, queue controls, Premium-popup recovery and browser shutdown. Tests also cover temporary interaction and restoration of the control lock.

Live OBS testing with the existing signed-in profile played the supplied videos with an active audio meter. An ad-supported video reported **Player ad data filtered**, with no observed ad or black-screen wait. A seek-based check crossed 14:45–15:24 without interruption. This does not verify long-duration mid-roll scheduling. The new filtered browser still needs a live entitled members-only video test; prior user verification was with the earlier browser implementation.

This is targeted experimental YouTube filtering, not the complete AdGuard engine. Unrecognized ads and future YouTube changes may still appear. Filtering failures preserve the original response and report status rather than leaving a paused request indefinitely. Membership, sign-in, age and content checks are unchanged. No cookies are exported, no second browser runtime is initialized, and no remote debugging port is opened.

---

# fKey Playback v1.7.9 — Recycled sorting + plugin 0.1.8

## Recycled queue ordering

Open **Control → Recycled**, choose Title (A–Z), VOD date in title (oldest/newest first), or Manual, then click **Sort all Recycled + save order**. Sorting covers every page and ignores the search filter. The chosen order persists through restart and applies to new additions, moves, imports, completed videos and discovered titles. You can now add/import directly to Recycled without starting playback.

Dates come from titles, not upload metadata: year-first dates such as `2023-05-12`, `2023.05.12`, `2023/05/12` and `2023_05_12` are supported. A year alone means January 1. Invalid or missing dates go last. Alphabetical title comparison breaks date ties. Manually reordering a row switches the lane to Manual. Existing stations default to Manual until an order is selected.

## Optional ad masking

The fKey Playback dock now offers **Hide ad video + mute ad audio**, off by default for new installs and saved between OBS sessions. Existing saved choices are retained. Detected YouTube advertisements produce black video and silent audio in the native Playback source while the saved queue position is held. Content returns after the player reports it ready. Ad suppression is independent of the normal transition timeout.

Ads still run in the signed-in output window and take their normal time. This masks the native OBS source; it does not skip ads or cover a separate Window Capture source. Detection depends on YouTube player markers. Sign-in and access/age/content confirmations remain manual. Live ad behavior has not been newly verified for this release. Full request-level ad blocking is deferred to a separate browser-integration change; this feature only masks detected ads.

The successful candidate branch is merged with its source materialized directly into the plugin files. This release retains the Windows startup fix and process cleanup from previous versions.

## Downloads and upgrade

- **Playback-v1.7.9.zip** — updated station app, plugin source and documentation.
- **fKey-Playback-OBS-Plugin-Setup-0.1.8.exe** — updated Windows installer.
- **fplayback-youtube-0.1.8-windows-x64.zip** — installer, plugin DLL, corresponding source and license.
- Each download has a SHA-256 checksum.

Stop Playback (including its automatic startup task), back up and preserve `data/` and launcher configuration, extract the station update and restart. Close OBS, run the 0.1.8 plugin installer, and restart OBS. Existing queues and settings are preserved; no database migration is needed. If you move the app to a new folder, rerun `INSTALL-AUTO-START.bat` there. Requires Windows x64 and OBS 32.2.2 / Qt 6.11.1; station requires Node.js 22.13 or newer.

## Validation

Validation covers JavaScript syntax and the full app suite, native plugin tests including the Ad Guard policy, installer build, release-package contents and SHA-256 checksums. Ad Guard regression tests exercise masking telemetry, browser mute restoration, long ads, queue checkpoint protection and the opt-out setting. Recycled tests cover title dates, full-lane sorting, automatic insertion, SQLite reload, unchanged playback state and authenticated controls.

---

# fKey Playback v1.7.8 — Windows startup fix

Windows can deny Playback's process check when the instance recorded in the startup lock is running under another account, such as the automatic startup service. Playback now handles this without an uncaught `kill EPERM` stack trace and keeps the lock intact.

A second interactive launch checks the configured local port and opens the existing dashboard if a healthy Playback server responds. If it cannot reach the dashboard, it shows an actionable message to stop the existing Playback process or startup task before trying again. Background startup remains headless. The fix never starts a second writer or deletes an inaccessible process's lock.

## Downloads and upgrade

- **Playback-v1.7.8.zip** — updated station app, tests and documentation.
- **fKey-Playback-OBS-Plugin-Setup-0.1.7.exe** and **fplayback-youtube-0.1.7-windows-x64.zip** — unchanged plugin downloads.
- Each download has a SHA-256 checksum.

Stop Playback, back up and preserve `data/` and launcher configuration, extract the app update, then restart. If automatic startup is enabled, stop that task before upgrading. No database migration or plugin reinstall is required for existing plugin 0.1.7 installations.

## Validation

JavaScript syntax checks and the full app suite cover simulated Windows permission denial, lock preservation, dead-PID recovery, duplicate background launch, healthy-dashboard detection and rejected/unavailable health responses. The duplicate interactive process test runs on headless Linux; browser launches are mocked on all platforms to avoid opening a real browser during tests.

---

# fKey Playback v1.7.7 — tidier app folder

Supporting documentation now lives in `docs/`: storage and migration guidance, build reports, historical performance measurements and release notes. README links and the GitHub release workflow use the new paths, and release ZIPs include the documentation in its new folder.

Startup shortcuts stay in the main folder. Runtime files, local data and backups are preserved. This release includes the process cleanup fixes from v1.7.6.

## Downloads and upgrade

- **Playback-v1.7.7.zip** — updated station app and organized documentation.
- **fKey-Playback-OBS-Plugin-Setup-0.1.7.exe** and **fplayback-youtube-0.1.7-windows-x64.zip** — unchanged plugin downloads from v1.7.6.
- Each download has a SHA-256 checksum.

Stop Playback, back up and preserve `data/` and launcher configuration, extract the app update, then restart. No database migration is needed. Existing plugin 0.1.7 installations do not need to be reinstalled. Upgrading in place may leave old root-level copies of the moved documentation; the current copies are in `docs/`.

## Validation

All 175 app tests and JavaScript syntax checks pass. Release-package verification checks documentation links, packaged documentation and startup shortcuts, ZIP integrity, and exclusion of private data and build outputs.

---

# fKey Playback v1.7.6 — process and resource cleanup

- **Stop output releases resources:** close the dedicated browser/window, release its worker lease, cancel pending native requests/retries, free capture textures, and disable browser audio capture. Start queue / retry recreates the output with the saved account session and placement.
- **Earlier OBS cleanup:** close the output before OBS tears down its scenes/browser framework. Audio capture stops and its thread is joined on source destruction.
- **Bounded station shutdown:** stop background work before draining HTTP connections, close stalled connections after a deadline, and make cleanup safe to call repeatedly. Release SQLite storage and the instance lock.
- **Extractor process cleanup:** cancel only the extraction's owned process tree and wait for its exit. Already-cancelled extraction cannot start a process; unrelated processes are preserved.

Shared OBS browser processes can remain while other OBS sources need them. Minimizing or closing a locked output still parks it intentionally for continued capture; use Stop output to release it. These fixes retain the video transitions, pause fix and saved-position protections from prior releases.

## Downloads and upgrade

- **Playback-v1.7.6.zip** — updated station app and plugin source.
- **fKey-Playback-OBS-Plugin-Setup-0.1.7.exe** — updated Windows installer.
- **fplayback-youtube-0.1.7-windows-x64.zip** — installer, DLL, corresponding source and license.
- Each download has a SHA-256 checksum.

Update both the station app and plugin. Stop Playback, back up and preserve `data/` and launcher configuration, extract the app update, then restart. Close OBS, run the plugin installer, and restart OBS normally. This build requires Windows x64 and OBS 32.2.2 / Qt 6.11.1; the app requires Node.js 22.13 or newer. No database migration is needed. Queues, settings and account data are preserved. Sign-in and access/age/content confirmations remain manual.

## Validation

All 175 app tests, JavaScript syntax checks and six native tests pass. New tests verify stalled HTTP shutdown, extraction abort, owned child-tree cleanup without killing an unrelated process, idempotent cleanup and lock release, and an actual station process exiting naturally without forced termination. Live OBS Stop/Start closed and recreated the dedicated renderer and worker lease. Full OBS shutdown left zero tracked OBS/browser processes running.

See the [plugin guide](https://github.com/imSlicedBread/Playback/blob/v1.7.6/obs-plugin/README.md).

---

# fKey Playback v1.7.5 — smoother transitions and pause without rewind

The native OBS source now holds the outgoing picture while the next queued video loads. It waits for a decoded frame and a full-window layout stable for 500 ms, then crossfades over 300 ms. YouTube layout changes withdraw readiness so the fade does not start on its smaller loading layout. Ads and access prompts are revealed when reported. A 15-second loading timeout releases the held picture for inspection; stop/sign-in cancels pending transitions and rapid queue changes replace them.

Pause and resume now preserve the browser's live position instead of seeking back to the last reported queue checkpoint. Explicit seek/replay, startup position restoration and protection against YouTube history resume remain included.

The fade is visual in the native OBS source. Audio retains its existing routing; videos are not preloaded, and first startup has no outgoing frame to blend. The separate YouTube output window may still show loading.

## Downloads and upgrade

- **Playback-v1.7.5.zip** — updated station app and plugin source.
- **fKey-Playback-OBS-Plugin-Setup-0.1.6.exe** — updated Windows installer.
- **fplayback-youtube-0.1.6-windows-x64.zip** — installer, DLL, corresponding source and license.
- Each download has a SHA-256 checksum.

Update both the station app and plugin for the pause fix. Stop Playback, back up and preserve `data/` and launcher configuration, extract the app update, then restart. Close OBS, run the plugin installer, and restart OBS normally. This build requires Windows x64 and OBS 32.2.2 / Qt 6.11.1; the app requires Node.js 22.13 or newer. No database migration is needed. Account data and queues are preserved. Sign-in and access/age/content confirmations remain manual.

## Validation

All 170 app tests, JavaScript syntax checks and six native tests pass. Coverage includes live-frame pause/resume, explicit seeks, stable layout readiness, late layout changes, stale callbacks, access/ad visibility, transition timing/timeouts, and D3D11 pixel checks for outgoing, blended midpoint and incoming frames. Live OBS checks confirmed rendering, audio, decoded/full-size readiness, and pause/resume without backward playhead movement. Visual timing across every YouTube loading variation remains subject to live testing.

See the [plugin guide](https://github.com/imSlicedBread/Playback/blob/v1.7.5/obs-plugin/README.md).

---

# fKey Playback v1.7.4 — prioritize the saved playback position

Previously, YouTube could apply its remembered watch position after Playback's initial seek, replacing the local queue checkpoint. The native plugin now opens the watch page with the saved queue time and rejects implausible history jumps during a ten-second startup guard. Pending seeks and rejected jumps do not report progress or completion. After ads or access prompts, the local queue position is reapplied. Dashboard seek/replay establishes a new checkpoint, and ordinary later manual seeks remain available when unlocked.

This protects future startup reports. It cannot recover an older checkpoint already overwritten before upgrading.

## Downloads and upgrade

- **Playback-v1.7.4.zip** — station app and plugin source.
- **fKey-Playback-OBS-Plugin-Setup-0.1.5.exe** — updated Windows installer.
- **fplayback-youtube-0.1.5-windows-x64.zip** — installer, DLL, corresponding source and license.
- Each download has a SHA-256 checksum.

Close OBS and run the plugin installer to apply the playback fix, then restart OBS normally. This build requires Windows x64 and OBS 32.2.2 / Qt 6.11.1. For the app update, stop Playback, back up and preserve `data/` and launcher configuration, extract the update, then restart. Node.js 22.13 or newer is required; no database migration is needed. Account data, queues and settings are preserved. Sign-in and access/age/content confirmations remain manual.

## Validation

All 165 app tests, JavaScript syntax checks and four native tests pass. Regression tests cover late history jumps, zero and paused checkpoints, false completion, pending seeks, post-ad resumption and preserved controls/watchdog behavior. A live OBS restart confirmed the paused video matched the local checkpoint and the worker reconnected; simulated traffic covers the late history override.

See the [plugin guide](https://github.com/imSlicedBread/Playback/blob/v1.7.4/obs-plugin/README.md).

---

# fKey Playback v1.7.3 — restore OBS windows after restart

- **Dock restoration:** preserve the fKey Playback dock open state, position and tab groups when OBS restarts. Playback begins after OBS finishes loading.
- **Reachable title bars:** move floating docks restored off-screen back into the monitor work area.
- **Output placement:** save position and minimized/parked state on normal OBS shutdown, then restore them at startup. Render size follows the saved resolution. Positions are adjusted to available monitors; Show output window restores a parked output for interaction.
- **Cleaner locked playback:** hide the channel watermark alongside ordinary player controls. Unlocking, ads and access prompts restore original styles.

## Downloads and upgrade

- **Playback-v1.7.3.zip** — station app and plugin source.
- **fKey-Playback-OBS-Plugin-Setup-0.1.4.exe** — updated Windows installer.
- **fplayback-youtube-0.1.4-windows-x64.zip** — installer, DLL, corresponding source and license.
- Each download has a SHA-256 checksum.

Close OBS and run the plugin installer. This build requires Windows x64 and OBS 32.2.2 / Qt 6.11.1. Restart OBS normally. Open and arrange the dock/output once, then close OBS normally to save their placement. For the app update, stop Playback, back up and preserve `data/` and launcher configuration, extract the update, then restart. Node.js 22.13 or newer is required; no database migration is needed. Account data and queue settings are preserved. Sign-in and access/age/content confirmations remain manual.

## Validation

All 162 app tests, JavaScript syntax checks and four native tests pass. Controller tests cover watermark hiding and exact style restoration for unlocked playback, ads and access prompts. Live OBS checks confirmed an open dock surviving restart, accessible dock title bar, hidden watermark, saved output position and playback reconnection. Parked state persistence is implemented; complete live parked-state restart acceptance remains pending.

See the [plugin guide](https://github.com/imSlicedBread/Playback/blob/v1.7.3/obs-plugin/README.md).

---

# fKey Playback v1.7.2 — cleaner OBS dock

Remove the introductory experimental watch-page/sign-in text from the fKey Playback OBS dock. Controls now begin with the station port. Output lock, saved resolution settings, audio, watchdog, overlay and queue controls remain included.

## Downloads and upgrade

- **Playback-v1.7.2.zip** — station app and corresponding plugin source.
- **fKey-Playback-OBS-Plugin-Setup-0.1.3.exe** — updated Windows installer.
- **fplayback-youtube-0.1.3-windows-x64.zip** — installer, DLL, corresponding source and license.
- Each download has a SHA-256 checksum.

Close OBS and run the updated plugin installer to remove the text. This build requires Windows x64 and OBS 32.2.2 / Qt 6.11.1. For the app update, stop Playback, back up and preserve `data/` and launcher configuration, extract the update, then restart. Node.js 22.13 or newer is required; no database migration is needed. Saved account data and settings are preserved.

## Validation

All 161 app tests, JavaScript syntax checks and four native tests pass. Live OBS verification confirmed the text is removed and playback resumes. Sign-in and access/age/content prompts remain manual.

See the [plugin guide](https://github.com/imSlicedBread/Playback/blob/v1.7.2/obs-plugin/README.md).

---

# fKey Playback v1.7.1 — OBS output lock and resolution settings

Choose and save the native OBS output render size from **Docks → fKey Playback → Output resolution**, then click **Apply**. Presets include **720p, 1080p, 1440p, 4K**, and **Match OBS canvas**. Windows display DPI is accounted for so the native source reports the selected pixel dimensions. Match OBS canvas reads the current canvas when applied; apply again after changing the canvas. YouTube stream quality remains automatic.

Playback keeps **Lock output (size + controls)** enabled: resizing and ordinary mouse/keyboard interaction cannot change the captured output, ordinary player controls stay hidden, and minimizing/closing the locked window parks it while rendering continues. Unlock for manual interaction; sign-in, ads and access/age/content dialogs remain manual.

## Downloads and upgrade

- **Playback-v1.7.1.zip** — station app and plugin source.
- **fKey-Playback-OBS-Plugin-Setup-0.1.2.exe** — Windows installer.
- **fplayback-youtube-0.1.2-windows-x64.zip** — installer, DLL, corresponding source and license.
- Each download includes a SHA-256 checksum.

Stop Playback, back up and preserve the complete `data/` directory and launcher configuration, then extract the app update. Node.js 22.13 or newer is required; no database migration is needed. Close OBS and run the new plugin installer. This build requires Windows x64 and OBS 32.2.2 / Qt 6.11.1. Restart OBS normally, open the fKey Playback dock, and apply the desired resolution. Existing signed-in account data and queue controls are preserved. Older manually transformed sources may need OBS **Transform → Fit to Screen** after changing resolution; plugin-added sources with canvas bounds fit automatically.

## Validation

All 161 app tests, JavaScript syntax checks, and four native tests pass. Native tests cover recovery policy, output resolution validation/DPI sizing, libobs scene setup, and installer upgrade/rollback/resources. Live OBS validation confirmed 1080p application with continuing playback and preserved framing. Members-only playback was previously confirmed by the user with an entitled signed-in account.

See the [plugin guide](https://github.com/imSlicedBread/Playback/blob/v1.7.1/obs-plugin/README.md).

---

# fKey Playback v1.7.0 — OBS plugin installer and automatic setup

This release includes the Windows OBS plugin installer and all recent plugin improvements, including automatic overlay setup, the fKey Playback dock name, and output-window handling that keeps video rendering while out of view. Existing native audio capture, playback watchdog, queue and whitelisted chat controls remain included.

## Downloads

- **Playback-v1.7.0.zip** — the station app and plugin source.
- **fKey-Playback-OBS-Plugin-Setup-0.1.1.exe** — the standalone Windows installer. No PowerShell commands or .NET installation are needed.
- **fplayback-youtube-0.1.1-windows-x64.zip** — installer, manual-install DLL, corresponding source and license.
- Each download has a matching **.sha256** file.

## Upgrade and setup

1. Stop Playback and back up the complete `data/` directory. Extract the app update while preserving your data and launcher configuration. Node.js **22.13 or newer** is required. No database migration is needed.
2. Close OBS, run the plugin installer, approve the Windows administrator prompt, and click **Install / Update**. It detects the usual OBS folder; **Browse** supports custom/portable installations. This build requires **Windows x64, OBS 32.2.2 / Qt 6.11.1** and refuses incompatible installations or an open OBS process.
3. Start OBS using your usual shortcut. Open **Docks → fKey Playback**, sign in to YouTube manually if needed, then choose **Start queue / retry** and **Add Playback source to current scene**. Disable the old `/player` Browser Source so only one output controls the queue.
4. The source action adds both video and transparent overlay, fits new video to the canvas, places the overlay above it, and reuses existing sources without duplicates. Existing video transforms are preserved. It repairs a missing overlay and updates its station port/canvas size on repeat use.
5. Playback starts with **Lock output (size + controls)** on: the render size is fixed at 1280×720, mouse/keyboard interaction is blocked, and ordinary YouTube transport controls are hidden. Close or minimize parks the locked window. Uncheck the lock and choose **Show output window** for manual YouTube interaction, then recheck it afterward. Sign-in mode unlocks automatically; starting the queue locks it again. Ads and access dialogs remain visible and require manual interaction.
6. Check the **Playback YouTube Output** audio meter and your stream/recording track. Keep monitoring off to avoid duplicate sound. Minimize parks the output outside the virtual desktop while it remains rendered; **Show output window** restores it for interaction. Keep the output window open.

The installer verifies staged files, backs up existing plugin/source/license files, and restores previous files if replacement fails. It installs corresponding source and GPL license under `data/obs-plugins/fplayback-youtube` inside OBS; previous files are under its `backups` folder. Scenes, settings and YouTube login data are preserved. See the [plugin guide](https://github.com/imSlicedBread/Playback/blob/v1.7.0/obs-plugin/README.md).

The dashboard sidebar now shows **fKey Playback**, **OBS Plugin Setup**, **Overlay Preview**, and the running station version. Overlay Preview does not start a competing playback controller.

## Validation

All **161 app tests**, JavaScript syntax checks and **three native tests** pass locally. Native tests cover watchdog limits, real libobs scene operations with test sources, installer fresh installs/upgrades, backups, injected rollback, locked-file refusal, compatibility validation and embedded DLL/source/license resources. The installer uses the static C++ runtime and imports only Windows system DLLs. Windows/Linux GitHub CI also gates publication.

Live OBS checks verified video, browser audio, queue controls, automatic advancement and capture with the output parked off-screen. On **October 20, 2026**, the user confirmed actual **members-only video playback** in the native plugin using the signed-in, entitled account. That result applies to the tested account and video; the separate embedded Browser Source workflow remains unverified for members-only playback. Sign-in, age/content confirmations and access dialogs remain manual. Live Kick/SOOP and full Windows reboot acceptance remain pending.

---

# Validation update — October 20, 2026

The user confirmed actual **members-only YouTube video playback** in the native OBS plugin using the signed-in account entitled to watch the video. This is user-reported live validation, beyond sign-in or private-playlist visibility, and applies to the tested account and video. The separate Browser Source embedded player remains unverified for members-only playback. Sign-in and YouTube access/age/content prompts remain manual.

The release-time verification notes below record the status before this confirmation.

---

# fKey Playback v1.6.1 — correct startup version display

Fix the startup banner and `/api/health` showing 1.5.1 after upgrading to v1.6.0. Both now read the version from `package.json`, and the headless startup test checks that they match. The README version is also updated.

This release retains the OBS YouTube plugin, native browser audio capture and playback watchdog from v1.6.0. The plugin binary is unchanged and is included as a separate download with corresponding source and checksum. Members-only playback remains unverified; sign-in and YouTube access prompts remain manual.

Download **Playback-v1.6.1.zip**, stop Playback, back up and preserve `data/`, extract the update, then restart Playback. The console will show **1.6.1 ready**. Existing v1.6.0 plugin installations need no plugin reinstall. New installations can follow the [OBS plugin guide](https://github.com/imSlicedBread/Playback/blob/v1.6.1/obs-plugin/README.md). No database migration is needed.

All 160 app tests and syntax checks pass locally, including version checks against a real server startup. The unchanged plugin passed its native build and recovery-policy test for v1.6.0.

---

# fKey Playback v1.6.0 — OBS YouTube plugin, audio and watchdog

This release adds an experimental Windows OBS plugin that plays the normal YouTube watch page using the account signed in inside OBS, while keeping Playback dashboard and chat queue controls. No Chrome extension is required.

- **Native video and audio:** the Playback YouTube Output source captures the plugin window and audio from this OBS instance's browser subprocesses. An upgrade from the video-only prototype enables Track 1 once. Other audible OBS browser panels sharing that process may also be captured; mute unused panels and keep source monitoring off.
- **Playback watchdog:** reload the same video after 10 seconds without playhead movement or a 30-second startup wait, restoring the saved queue position and audio. Pause, voting, ads, blocked autoplay and visible access/confirmation dialogs suspend recovery. Limit reloads to three per five minutes with a 15-second cooldown, then hold for manual retry. A completely unresponsive browser requires manual inspection.
- **Existing controls:** pause/resume, seek, previous/replay, audio, direct video adding, voting and completion use the existing local worker lease. Optional start with OBS and a transparent `/overlay` source are included.
- **OBS Browser Source account mode:** an opt-in signed-in embed host and error holds are also available. YouTube embedding restrictions still apply; account mode cannot guarantee restricted-video playback.

## Downloads and upgrade

1. Download **Playback-v1.6.0.zip** and its checksum. Stop Playback and back up the complete `data/` directory. Extract the update while preserving your data and launcher configuration. Node.js **22.13 or newer** is required; no database schema migration is needed.
2. For the experimental plugin, also download **fplayback-youtube-0.1.0-windows-x64.zip** and its checksum. It targets **Windows x64, OBS 32.2.2 / Qt 6.11.1**. Other versions have not been tested.
3. Close OBS, back up your scene collection/profile, then copy `obs-plugins/64bit/fplayback-youtube.dll` from the plugin ZIP into `C:\Program Files\obs-studio\obs-plugins\64bit`. Do not replace OBS's own DLLs.
4. Start Playback and OBS. Open **Docks → Playback YouTube**, disable the old `/player` Browser Source, sign into YouTube manually, choose **Start queue / retry**, and add **Playback YouTube Output** to the scene. Fit it to the canvas and keep the output window open and unminimized. Check its mixer signal and Track 1 routing. Optional overlays use `http://127.0.0.1:4177/overlay` above this source.
5. Follow the [plugin setup and troubleshooting guide](https://github.com/imSlicedBread/Playback/blob/v1.6.0/obs-plugin/README.md). The plugin ZIP includes corresponding GPL-2.0-or-later source; the main station retains its existing license.

## Validation and limitations

All **160 app tests**, JavaScript syntax checks, the Windows native build and the native recovery-policy test pass locally. Watchdog fault cases use simulated DOM traffic and native policy tests. Live OBS checks confirmed signed-in session reuse, public-video playback, pause/seek/resume, progress, completion, startup after restarting OBS, and browser audio reaching the OBS mixer. An age-restricted video played after the user manually accepted YouTube's prompt.

**Members-only playback remains unverified.** Sign-in or private-playlist visibility does not prove access to a restricted video. Membership entitlement, account challenges and YouTube playback restrictions remain YouTube's responsibility. Sign-in, age/content confirmations and access dialogs require manual interaction. YouTube page changes may require plugin updates. Live Kick/SOOP and full Windows reboot acceptance remain pending.

---

# fKey Playback v1.5.1 — Windows startup and OBS recovery

This update improves unattended startup after a Windows reboot and helps the OBS player recover when YouTube is not ready during startup.

- **Optional OBS startup:** the Windows installer can register OBS to open at sign-in after Playback's backend is healthy. It opens the dashboard first and avoids starting another OBS process when one is already running.
- **Remembered dashboard login:** check **Keep signed in on this computer for 30 days** when logging in. A signed HttpOnly cookie survives browser and server restarts; the operator token is not stored in browser storage or startup URLs. Logging out, clearing cookies, private browsing or expiration requires another login.
- **Player recovery:** retry failed YouTube API/iframe startup and unstarted video loading. Preserve saved resume positions and intentional pauses, ignore callbacks from replaced iframes, and avoid quarantining videos for transient HTML5 startup errors.
- Existing Twitch, Kick and SOOP connections, queues and SQLite data remain compatible. No database schema migration is required.

## Upgrade and one-time startup setup

1. Stop Playback and back up the complete `data/` directory. Extract this release while preserving `data/`, `tools/` and launcher configuration. Node.js **22.13 or newer** is required.
2. Run **INSTALL-AUTO-START.bat** again, choose whether to start OBS, and approve the administrator prompt. Playback must be in a permanent local folder outside the user profile, with Node installed for all users. Custom OBS paths are supported by the PowerShell installer; see the [startup instructions](https://github.com/imSlicedBread/Playback#windows-automatic-startup).
3. Sign in once using the remembered-login checkbox in your usual browser profile at `http://127.0.0.1:4177/control`.
4. Keep the OBS Browser Source active at `http://127.0.0.1:4177/player`, with **Shutdown source when not visible** disabled. Disable **Refresh browser when scene becomes active** for continuous playback. Remove a duplicate OBS Windows startup entry if using Playback's OBS launch option.
5. Restart Windows to validate your workstation. The backend starts before sign-in; **OBS and the browser require Windows desktop sign-in**. Playback does not configure Windows automatic sign-in or start OBS streaming/recording.

All **141 automated tests** and JavaScript syntax checks pass locally on Windows, including simulated startup timing, persistent login across a real backend restart, and player recovery. Actual workstation reboot/OBS acceptance remains required. Live Kick/SOOP validation also remains pending. The release ZIP includes checksum-verified yt-dlp and a SHA-256 checksum file.

---

# fKey Playback v1.5.0 — Kick and SOOP admin chat

Kick and SOOP now have independent admin chat readers under **Settings → Chat Connections**. Each reader starts disabled with an empty, private whitelist. Explicitly allowed platform accounts can use the existing playback, audio and video-adding commands. Broadcasters and moderators receive no automatic access.

- Kick uses a read-only Pusher connection. Configure the channel and whitelist; a manual numeric chatroom ID is available when channel lookup is blocked.
- SOOP uses an independent Playback OAuth connection. Configure your own SOOP application credentials and approved `broad_access_chatinfo` scope, then run `npm run connect:soop`. The callback is local to `127.0.0.1:4180`; tokens and refresh rotation stay in the local data directory. The authorized broadcast must be live.
- All three readers share the station command budget and latest-20 activity list. Access uses platform-specific sender identities. Public snapshots exclude whitelists and credentials.
- Twitch viewer votes, skip votes and requests retain their behavior. Kick/SOOP add admin commands only. No chat replies or moderation messages are sent.
- Reconnect controls, connection status and Settings draft preservation are included. Older dashboard clients preserve the new settings when saving unrelated changes.

## Upgrade and setup

Stop Playback and back up the complete `data/` directory. Extract this release while preserving `data/`, `tools/` and launcher configuration, then restart and refresh dashboard/player pages. Node.js **22.13 or newer** is required. No database schema migration or queue reset is needed. See the [README setup instructions](https://github.com/imSlicedBread/Playback#kick-and-soop-admin-chat-readers) for provider configuration.

All 135 automated tests and JavaScript syntax checks pass locally on Windows. Automated acceptance uses simulated provider traffic, including identity checks, malformed messages, reconnection, OAuth renewal, command dispatch, persistence and Settings behavior. Kick's transport is unofficial; SOOP implements the receive-only protocol checked against fStream's pinned official SDK. **Live Kick/SOOP validation in Playback remains pending** and requires a configured channel and an authorized SOOP account. The Windows ZIP includes the checksum-verified yt-dlp bundle.

---

# fKey Playback v1.4.0 — Twitch chat admin whitelist

Selected Twitch users can now control playback and add videos directly from chat. Configure their usernames under **Settings → Twitch Chat → Chat Admin Whitelist**, then click **Save Settings**. The list starts empty and is visible only to authenticated dashboard operators. Broadcasters and moderators must also be explicitly listed.

- Playback: `!pause`, `!resume`, `!forceskip`, `!previous`, `!replay`, `!seek SECONDS`.
- Audio: `!volume 0-100`, `!mute`, `!unmute`. Unmuting at zero restores volume to 50.
- Video adding: `!add URL`, `!playnext URL`, `!playnow URL`, also accepting video IDs and optional ` | Display title`. Play Now parks the interrupted video to resume next.
- Viewer `!skip` remains a skip vote. Viewer requests still require approval. Chat commands cannot manage access or edit station settings.
- Commands require a numeric Twitch sender identity and origin in the configured channel. Duplicate message IDs and Shared Chat forwarding from other rooms are ignored.
- Allow two seconds between commands per account; the station accepts at most 30 per minute. Settings shows the latest 20 authorized command attempts and results. Activity clears on restart; no chat replies are sent.
- Saving access changes takes effect immediately. Existing queues, playback timestamps, overlay settings and SQLite storage remain compatible.

## Upgrade

Stop Playback and back up the complete `data/` directory. Extract this release while preserving `data/`, `tools/` and launcher configuration, then restart. Refresh dashboard and player pages once to load v1.4.0 assets. No database schema migration or queue reset is needed. Access follows usernames, including any later username ownership changes.

All 123 automated tests and JavaScript syntax checks pass locally on Windows. Tests simulate Twitch traffic through the real connector and exercise HTTP, persistence, rollback and Settings event handlers. Live Twitch/YouTube/OBS operation still requires testing on the streaming workstation. The official Windows ZIP includes the existing checksum-verified yt-dlp bundle.

---

# fKey Playback v1.3.1 — Bulk queue move progress

The Smart Rotation Queue can now move selections larger than 500 videos automatically. The control dashboard splits a selected move into batches of 250, waits for each confirmed server commit, and reports moved/total counts, a percentage bar, batch count, errors and safe cancellation.

- **Select all matching** selects all videos in the active lane matching the current search, across every page. It does not select just the 50 visible rows.
- A move of 1,702 videos is seven batches (six batches of 250 plus the remaining 202), each committed before progress advances.
- If a batch fails or you stop, previously committed batches remain moved. Unconfirmed videos stay selected; choose **Move Selected** to retry after resolving any error.
- Queue rows and selected destination stay usable during regular polling. Playback and OBS are not paused by the move UI.
- The server retains its safety limit of 500 IDs per request, separate from the total library capacity, and the move engine now avoids quadratic per-entry searches.
- The SQLite storage upgrade from v1.3.0, uncapped rotation library, paginated dashboard, and bundled Windows yt-dlp are retained.

## Upgrade

Stop Playback, including the Windows startup task if configured, and back up the entire `data/` directory. Extract this release while keeping `data/` and `tools/`, then restart. Refresh the dashboard with **Ctrl+F5** once to bypass stale JavaScript. The existing `playback.sqlite3` remains compatible: no database migration or playlist reset is needed.

The official GitHub Windows package includes SHA-256-verified `yt-dlp.exe`. Live OBS/YouTube operation and the client's original workload still require an on-device acceptance test.

---

# fKey Playback v1.3.0 — SQLite storage and uncapped rotation queues

## Changes

- Removed the fixed total queue capacity, including the old 2,000-entry cap and queue truncation on startup. All four rotation lanes support larger libraries.
- Replaced production JSON snapshot persistence with indexed SQLite row storage in `data/playback.sqlite3`.
- Playhead, pause, volume, mute and ordinary settings commits write only the small station-state record; unchanged queue rows are not rewritten.
- Catalog changes use transactional row updates. Stable ordering positions avoid rewriting the remaining queue when its first video completes.
- Automatic migration preserves legacy JSON and creates an exact-byte `state.before-sqlite-migration.json` backup before committing the import.
- Added `npm run backup` for a verified, consistent database snapshot and `npm run benchmark:storage` for reproducible measurements.
- Preserved the paginated 50-row dashboard, complete-lane search, compact polling, dropdown stability, voting and OBS controls.

## Verification

The local Node suite passed 101 tests, with one Windows-only test skipped on Linux (102 total). Storage tests import and reload 10,000 videos, preserve an almost 8,000-entry legacy station, roll back injected commit failures, recover after a forcibly killed process, and verify live database backups. A real HTTP test imports 3,000 videos in batches, adds beyond the former cap, exercises controls and checks restart recovery.

An offline Chromium check using a Python HTTP bridge to the real SQLite test backend verified login, paging, search for video 9,999, stable destination selection, moving, pause and seek with 10,000 entries. Only 50 queue rows were mounted. Direct Chromium loopback navigation was blocked by the build environment, so this is not a live YouTube/OBS browser test.

At 10,000 videos in a synthetic local-disk benchmark, median checkpoint time was approximately 4.82 ms with the old JSON adapter versus 0.39 ms with SQLite; SQLite serialized 1,197 bytes and changed zero catalog rows per ordinary checkpoint. Catalog mutations and cold starts still perform work proportional to library size; see `BUILD-REPORT.md` and `STORAGE.md` for measurements and limitations.

## Upgrade — back up first

Stop Playback, including the Windows startup task if active. Back up the complete `data/` folder. Extract this release into the permanent installation while retaining `data/`, `tools/` and any local launcher configuration, then restart. The first start migrates JSON automatically. Refresh the dashboard and OBS source once after upgrading. Reinstall startup tasks only if the install location changes.

After migration, `playback.sqlite3` is authoritative. The old JSON is not kept up to date. Use `npm run backup` for a live backup or stop Playback before copying the full data directory. Never copy only a live SQLite main file or mix a restored database with unrelated WAL/SHM files. Older releases cannot read the new database: rollback requires the pre-upgrade directory backup and loses changes made after migration.

No fixed total queue limit is imposed. Safe per-request limits remain (300 pasted videos, 500 playlist entries, 500 bulk moves), along with the 200-request moderation inbox and recent-history retention. 10,000 is the tested library size, not a new cap or a hardware-independent performance guarantee.

The official Windows release continues to bundle verified `yt-dlp.exe` and its licensing notices. A separately named source/update ZIP requires retaining the existing `tools/` directory. Node.js 22.13+ and an active OBS/browser source are still required.
