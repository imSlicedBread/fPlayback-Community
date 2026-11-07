# fKey Playback 1.7.16

Made by **fKey Labs Inc.** A persistent, local 24/7 YouTube station with an OBS Browser Source and a separate operator dashboard.

[Releases](https://github.com/imSlicedBread/fPlayback-Community/releases) · [MIT license](LICENSE) · [Storage and migration](docs/STORAGE.md) · [Security](SECURITY.md)

Supporting documentation: [release notes](docs/RELEASE_NOTES.md), [storage verification](docs/BUILD-REPORT.md), and [historical performance measurements](docs/PERFORMANCE.md).

## New in v1.7.16 — OBS 33.0.1 installer

The Windows x64 OBS 33 installer **0.1.13** supports **OBS 33.0.0 and 33.0.1**. It checks for Qt 6.11.1 and CEF 150.0.20 before installing. Close OBS and choose **fKey-Playback-OBS-Plugin-Setup-0.1.13-OBS33.exe**. OBS 32.2.2 uses the installer without the **-OBS33** suffix. See the [OBS plugin setup guide](obs-plugin/README.md).

## Included from v1.7.15 — visible OBS auto-start

Windows auto-start now opens OBS visibly after the Playback station is healthy. The boot server still starts before sign-in; the interactive sign-in task waits for it, opens the dashboard, and launches OBS once. Previously OBS could start with its main window hidden.

The real scheduled tasks were tested locally with OBS 33: the launcher waited while the station was stopped, Playback started under LOCAL SERVICE, and OBS opened after the health check. A clean launch resumed the saved video at 1080p with audio. The test did not reboot Windows.

Update the station files while preserving `data/` and your launcher configuration. Existing startup tasks use the updated script in place. Run `INSTALL-AUTO-START.bat` and choose Y for OBS if startup is not installed or you moved the folder. Plugin 0.1.12 is unchanged; no plugin reinstall or database migration is needed.

## Included from v1.7.14 — 1080p, station warnings and optional Twitch restarts

Plugin **0.1.12** prefers 1080p YouTube video when available and shows the actual decoded height in the OBS dock. Output resolution remains a separate setting: choose 1920 x 1080 and Apply for a full HD source. Lower-resolution videos use the best available lower quality.

The dock opens a red warning when the Playback station is unavailable, even if output auto-start is off. Run `start-player.bat` or install Windows automatic startup. A lost station pauses and hides video, silences audio, and reconnects automatically when the station returns.

**Restart Twitch stream before 48h** is optional and off by default. It stops OBS's main Twitch stream at 47h55m, waits two minutes, then starts it again while Playback continues. Manual stops do not trigger an automatic restart. Uncheck to cancel a pending restart. Other services and multistream plugin outputs are not controlled.

Update both the station app and the matching OBS 32 or OBS 33 plugin. No database migration is needed. Stream restart timing is tested with accelerated time; a real 48-hour broadcast remains untested.

## Included from v1.7.13 — overlay title sync

The OBS overlay keeps the outgoing video's title while the next video loads, then changes after the 300 ms crossfade. Update the station and install plugin **0.1.11** for your OBS version. Next and Previous were verified live in OBS 33; the original playback position was restored after testing. No database migration is needed.

## Included from v1.7.12 — OBS 33 support and long-running recovery

Plugin **0.1.11** provides separate installers for **OBS 32.2.2** and **OBS 33.0.0** (Windows x64 / Qt 6.11.1). Choose the **-OBS33** installer for OBS 33. Both keep experimental ad filtering, the existing OBS browser account context, Playback queue controls and Interact. The installer and running plugin check the matching Chromium runtime; no OBS/Chromium DLLs or login data are replaced.

Renderer crashes recreate Playback's browser at the saved queue checkpoint, subject to bounded recovery attempts. The recognized generic YouTube playback error is retried after 30 seconds while access/content prompts remain manual. Expired output records and title-lookup caches are now bounded, browser callback lifetimes are tightened, and five-minute resource summaries are written to the OBS log.

Update the station and install the matching plugin with OBS closed. No database migration is required. See the [compatibility guide](docs/OBS33-COMPATIBILITY.md) and [memory investigation](docs/MEMORY-AND-CRASH-RECOVERY.md). Short lifecycle tests and live OBS 33 controls passed; entitled members-only playback on OBS 33 and a multi-day YouTube/GPU soak still need verification.

## Included from v1.7.11 — clearer Recycled sorting controls

Each queue tab now shows only its own sorting controls. Upcoming shows **Apply to Upcoming**; Recycled shows **Sort all Recycled + save order**, with title and VOD-date ordering. Hidden controls cannot sort another lane. The saved Recycled order and automatic insertion behavior are unchanged. OBS plugin 0.1.9 is unchanged; no plugin reinstall or database migration is needed.

## Included from v1.7.10 — ad request filtering and output interaction

Plugin 0.1.9 adds **Block ads before playback (experimental)**, enabled by default, using the existing signed-in OBS YouTube profile. It blocks known ad requests and removes recognized player ad data before playback, preserving Playback queue controls. With filtering enabled, ad masking is disabled so missed ads do not become a black-screen wait. This is targeted YouTube filtering, not a complete AdGuard engine or a guarantee against future ads.

Use **Interact with output** in the dock to temporarily enable YouTube controls, then **Finish interaction** to restore the control lock. Resolution and full-window layout stay in place; visible YouTube controls can appear in the broadcast during interaction. Premium marketing prompts no longer prevent full-window recovery; account and content confirmations remain manual.

Install the new 0.1.9 plugin with OBS closed. It requires Windows x64 and the matching OBS 32.2.2 / Chromium 127.145.7 runtime. See the [plugin guide](obs-plugin/README.md) for validation and limitations. No database migration is needed.

## Included from v1.7.9 — Recycled sorting and optional ad masking

Under **Control → Recycled**, choose Title (A–Z), VOD date in title (oldest/newest first), or Manual, then **Sort all Recycled + save order**. Sorting covers the entire lane; new additions, moves, imports and completed videos follow the saved order. Chronological sorting uses year-first VOD dates in titles, with year-only dates treated as January 1 and undated titles last. Using a row’s up/down buttons returns the lane to Manual. You can now add/import directly to Recycled.

Plugin 0.1.9 adds **Hide ad video + mute ad audio** in the fKey Playback dock, off by default for new installs and saved between sessions. Detected YouTube ads are masked with black video and silent audio in the native OBS source while Playback holds the queue position. Ads still run and take their normal time; the output window may show them. Access and confirmation prompts remain manual.

## Included from v1.7.8 — Windows startup lock handling

If Windows denies the process check for an existing instance, Playback now preserves the lock and explains how to use or stop the existing station. A second interactive launch opens a healthy existing dashboard instead of starting another server. Startup failures show a readable message. These fixes are retained in plugin 0.1.9.

## Included from v1.7.7 — tidier app folder

Supporting documentation now lives in `docs/`, with updated links and release packaging. Startup shortcuts stay in the main folder. Local data and backups are preserved. These fixes are retained in plugin 0.1.9.

## Included from v1.7.6 — process and resource cleanup

Stop output now closes its browser/window and releases capture resources; Start recreates them with the saved account session and placement. Station shutdown drains connections within a deadline and cancels extraction process trees without terminating unrelated processes. Update the station app and install plugin 0.1.9 for these fixes.

## Included from v1.7.5 — smoother transitions and pause without rewind

The native OBS source holds the outgoing frame while the next video loads, waits for a stable full-window picture, then crossfades over 300 ms. Pause and resume preserve the live frame instead of seeking back to a stale checkpoint. Install plugin 0.1.9 and update the station app for both fixes.

## Included from v1.7.4 — use the saved Playback position

Open videos at the local queue checkpoint and protect it against delayed YouTube watch-history resume during startup. Pending seeks and rejected browser-history jumps cannot overwrite the checkpoint or falsely advance the queue. Install plugin 0.1.9 for the fix.

## Included from v1.7.3 — restore OBS windows after restart

Restore the fKey Playback dock open state and layout after restarting OBS. Keep floating dock title bars reachable. Save the output window position and parked state on normal shutdown and restore them on startup. Locked playback also hides the channel watermark. Install plugin 0.1.9 for these improvements.

## Included from v1.7.2 — cleaner OBS dock

Remove the introductory experimental/sign-in text from the fKey Playback dock. The controls now begin with the station port. Install plugin 0.1.9 for this change.

## Included from v1.7.1 — OBS output lock and resolution settings

The fKey Playback OBS dock now saves an output render resolution: 720p, 1080p, 1440p, 4K or Match OBS canvas. Choose a size and click Apply. Display DPI is accounted for, and the output lock keeps window resizing and player interaction from disrupting capture. YouTube stream quality remains automatic. Install the updated 0.1.9 plugin to use these controls.

## Included from v1.7.0 — OBS plugin installer and automatic setup

Run **fKey-Playback-OBS-Plugin-Setup-0.1.11.exe** with OBS closed, approve the Windows prompt, and click **Install / Update**. The installer detects OBS, checks compatibility, and backs up the previous plugin. In **Docks → fKey Playback**, **Add Playback source to current scene** sets up both video and overlay. Minimize parks the output out of view while capture continues. See the [plugin guide](obs-plugin/README.md) or **OBS Plugin Setup** in the dashboard sidebar. Members-only playback was user-verified with a signed-in, entitled account.

## New in v1.6.1 — OBS plugin and accurate version reporting

The experimental [OBS YouTube plugin](obs-plugin/README.md) includes native audio and a bounded playback watchdog. Startup and health checks now report the package version consistently. The user verified members-only playback in the native plugin with a signed-in, entitled YouTube account on October 20, 2026.

## New in v1.5.1 — Windows startup and OBS recovery

Choose optional OBS startup in **INSTALL-AUTO-START.bat**, keep dashboard login for 30 days, and recover automatically from YouTube startup failures. See [Windows automatic startup](#windows-automatic-startup) for the one-time setup and reboot check.

## New in v1.5.0 — Kick and SOOP admin chat

Connect Kick and SOOP independently under **Settings → Chat Connections**, with separate private whitelists and shared playback commands. Both readers start disabled. SOOP includes a local OAuth setup helper. See [setup and connection details](#kick-and-soop-admin-chat-readers).

## New in v1.4.0 — Twitch chat admin whitelist

Give selected Twitch usernames playback and video-adding commands from **Settings → Chat Connections**. The whitelist is private and empty by default. Command results appear in Settings; existing viewer voting and requests keep their behavior. See [Twitch chat admin whitelist](#twitch-chat-admin-whitelist) for commands and access rules.

## Large bulk queue moves — v1.3.1

The queue panel now includes **Select all in lane / Select all matching**, so operators can choose all 1,702+ videos with one click even though only 50 queue rows are rendered per page. Click **Move Selected** to move the entire selection, automatically processed in **250-entry durable batches**. A live progress bar reports confirmed moved/total, percentage and batch number. **Stop after current batch** cancels safely between server requests; batches already committed remain moved. Failed batches leave unconfirmed videos selected for retry. The server deliberately retains its 500-ID maximum per request, which is not a limit on how many videos can be moved in one dashboard operation. Avoid closing the browser while a bulk move is active. See `docs/STORAGE.md` for persistence and backup details.

## New: SQLite storage and no fixed queue cap

The fixed 2,000-entry rotation-queue cap and startup truncation are removed. SQLite stores queue entries separately from playback state, so frequent playhead saves no longer rewrite a large JSON library. Tested with **10,000 videos**, while keeping the existing 50-row paginated dashboard and compact live polling.

Existing `state.json` installations migrate automatically with an exact pre-migration backup. The new database is `data/playback.sqlite3`; it becomes authoritative after migration. **Back up the complete data folder before upgrading.** Read [STORAGE.md](docs/STORAGE.md) for migration, backup and rollback instructions. Do not copy only the database file from a running station.

## Start on Windows

Experimental signed-in YouTube watch-page output is available as a native
[OBS plugin prototype](obs-plugin/README.md). It keeps the Playback queue controls
and supplies its own native video source. It requires OBS 32.2.2 / Qt 6.11.1 on Windows x64;
members-only playback has been user-verified with a signed-in, entitled account.

1. Install Node.js **22.13 or newer**. There are no npm runtime dependencies.
2. Extract the complete release into a permanent directory such as `C:\Playback`.
3. Double-click `start-player.bat`. The dashboard opens after the server is ready.
4. Sign in with the operator token in `data/admin-token.txt`. Keep that file private.
5. Add videos or use **YouTube Playlist Importer → Extract Videos → Import Selected**.
6. In OBS, add a Browser Source using `http://127.0.0.1:4177/player`, width 1920 and height 1080. Keep the source active.

Linux/macOS: run `./start-player.sh` or `node server.js`. The official Windows ZIP bundles the pinned, checksum-verified `yt-dlp.exe`; Linux/macOS users should install their platform's yt-dlp and set `YT_DLP_PATH` if needed. Playlist extraction imports metadata, not video files. Optional `YOUTUBE_API_KEY` supports the official API extraction route.

## Pages

| Page | Address | Purpose |
| --- | --- | --- |
| Control | `http://127.0.0.1:4177/control` | Operator playback, search, paginated queues, imports and requests |
| Settings | `http://127.0.0.1:4177/settings` | Playback, chat connections, colors, lower-third and vote-screen editors |
| OBS source | `http://127.0.0.1:4177/player` | Video, title overlay and end-of-video voting |
| YouTube sign-in setup | `http://127.0.0.1:4177/youtube-setup` | Sign-in instructions for the existing OBS Browser Source |
| Clean OBS source | `http://127.0.0.1:4177/player?clean=1` | No lower third; voting screen remains available |
| Viewer portal | `http://127.0.0.1:4177/vote` | Local viewer suggestions and voting |

The server does not render/encode video by itself. OBS or an active player browser is required. Closing the Control tab does not stop a separate OBS player; disabling the player source does stop playback.

## YouTube sign-in inside OBS

For account-restricted videos, use the existing OBS Browser Source with its own YouTube login:

1. In **Settings → Playback**, enable **Use the YouTube account signed in inside OBS** and **Save Settings**. This opt-in switches the embedded player to `www.youtube.com`; the default remains the privacy-enhanced `youtube-nocookie.com` player.
2. Temporarily change the Playback Browser Source URL in OBS to **https://www.youtube.com/**, click **Interact**, then sign in to the Google/YouTube account that can play the video. Enter credentials only on Google's own sign-in screen. The [local setup page](http://127.0.0.1:4177/youtube-setup) can also open YouTube in that same source.
3. Restore the **same source** to **http://127.0.0.1:4177/player** (or `/player?clean=1`). Keep **Shutdown source when not visible** and **Refresh browser when scene becomes active** disabled. Use only one active player output.
4. Test actual video playback, dashboard controls, voting and a restart of OBS on the streaming workstation. OBS manages its own login session; signing into Chrome or the Playback dashboard is separate. Clearing OBS browser cookies, account expiration or a Google challenge can require another login.

Account mode keeps normal queue, audio and overlay controls. It holds the current video on player errors, with an on-screen Retry action and setup link, rather than automatically quarantining/skipping an account-restricted video. You may skip manually from the dashboard. Turn account mode off to return to default playback. Playback does not inspect Google cookies, collect credentials or claim a connected account status.

**Verified locally:** Google sign-in succeeded in the OBS Browser Source and private playlists were visible. **Not yet verified:** playback of account-restricted videos through Playback's embedded player, members-only videos in that embedded player, and login persistence after reboot. A private playlist listing does not prove private-video playback. YouTube can still prohibit embedding or withhold account access; enabling this option is not a guarantee of members-only support. [YouTube documents](https://support.google.com/youtube/answer/171780?hl=en) that age-restricted videos cannot play on most third-party websites. Sign-in does not override that restriction: such a video may require the normal YouTube watch page. Account mode holds errors instead of skipping, but cannot make an embedding-restricted video playable.

## Smart Rotation Queue

**Play Next** has priority. **Upcoming** contains unplayed/new videos. Completed or skipped videos enter **Recycled**, and explicitly deferred videos wait in **Next Rotation**. Once the playable queue is exhausted, deferred and recycled entries enter the following rotation. Offline time does not advance the saved video or voting countdown.

Owner actions include Play Now (parking interrupted playback), Play Next, moves between lanes, bulk move, reorder, sorting and shuffle. The UI shows 50 videos per page, not a 50-video library limit. Search covers the entire selected lane; selection can span pages.

There is no fixed total queue capacity. Per-action safety limits remain: 300 pasted videos, 500 playlist entries per extraction/import and 500 entries per server bulk-move request (the dashboard automatically batches larger selections). The pending-suggestion inbox is limited to 200 to prevent abuse, and recent history retains 300 events. These are not rotation-library caps.

## OBS appearance and controls

The dashboard includes a draggable seek bar, direct seek input, transport buttons, volume and mute. Settings support independent visibility for channel name, NOW PLAYING, duration and skip count; title-only display; title text scaling; top/bottom anchoring; card height and background opacity; and drag-to-resize editing. Long titles scroll only when needed. Caption suppression is best effort and cannot remove captions burned into video pixels.

The four-choice voting screen can be styled independently. Twitch commands are `!vote 1` through `!vote 4`, `!skip` and `!request URL`. Anonymous IRC reading is unofficial and may change; authenticated IRC uses `TWITCH_USERNAME` and `TWITCH_OAUTH_TOKEN` in the server environment. No bot chat messages are sent.

## Kick and SOOP admin chat readers

**Settings → Chat Connections** includes independent Kick and SOOP readers, each disabled with an empty whitelist by default. Their admin commands are the same as Twitch's list below; Kick/SOOP viewer votes, suggestions and chat replies are not added. Only the saved platform-specific whitelist grants access. Being a moderator or having the same username on Twitch does not grant access on another platform. Activity identifies the platform, and the 30-per-minute station budget is shared across all three readers.

**Kick:** enter the channel login and allowed account usernames, enable the reader, and save. The read-only Pusher/WebSocket transport follows fStream's live-tested adapter and requires neither OAuth nor a public webhook. It is unofficial and can change. If public channel lookup is blocked, enter the channel's numeric chatroom ID. Click **Reconnect Kick** after correcting connection settings. Only live chat events from the subscribed room and actual sender identities can execute commands; display names, old messages and duplicate message IDs cannot grant access.

**SOOP:** this is an independent connection to the current SOOP platform at `sooplive.com`, following the official SDK protocol used by fStream. It does not use fKey login, fStream's application credentials, or its backend. Configure it once:

1. Register your own application at [SOOP Developers](https://developers.sooplive.com/), register redirect **`http://127.0.0.1:4180/callback`**, and obtain approval for **`broad_access_chatinfo`**. This is SOOP's combined chat retrieval/sending scope; Playback uses it for reading and never sends chat messages or moderation commands.
2. Set **`SOOP_CLIENT_ID`** and **`SOOP_CLIENT_SECRET`** in the environment used to launch Playback and its setup command. Restart Playback if its launch environment has changed.
3. In the community app folder, run **`npm run connect:soop`** from that environment. Open the private localhost link printed in the terminal and authorize your SOOP account. The one-shot callback listener binds only to `127.0.0.1:4180` and closes on success or after ten minutes. No public listener or tunnel is required.
4. In **Chat Connections**, enter your broadcaster account login ID and the allowed SOOP users' login IDs (not nicknames), enable SOOP, and save. Start the authorized SOOP broadcast and click **Reconnect SOOP**. The account must have access to that live broadcast.

The setup tool saves tokens to **`data/soop-auth.json`**, or the corresponding `DATA_DIR`. The server renews access using your application credentials and preserves rotated refresh tokens locally. Client secrets and tokens are never returned by operator/public APIs. A pre-existing `SOOP_ACCESS_TOKEN` and optional `SOOP_REFRESH_TOKEN` can be supplied instead; environment token changes take precedence over cached credentials. Without refresh authorization, expired access requires reconnecting the account. Use the same `DATA_DIR` for setup and the station.

The SOOP reader implements only authenticated login, room join, keepalive, and public/manager-message receipt. Guest identities, nicknames, whispers, donation/VOD events, and wrong-room sessions do not grant admin access. It does not download or execute a remote SDK at runtime. Its handshake was compared byte-for-byte against fStream's pinned official SDK (`2026-10-02`, SHA-256 `8f89b163d29ddf885dd3de9cddba98b8446fe26c8b3d96483644f4acb47254a5`). Live Kick/SOOP acceptance testing in Playback remains necessary; fStream's live results are reference evidence, not a Playback live test.

## Twitch chat admin whitelist

In **Settings → Chat Connections**, enter allowed Twitch usernames separated by commas or newlines, then click **Save Settings**. Names ignore capitalization and an optional leading `@`. Only explicitly listed names qualify, including the broadcaster and moderators. The list starts empty, supports up to 100 users, and is visible only to logged-in dashboard operators. Removing a name takes effect on the next command. Access follows the username if it changes ownership; update the list after username changes.

| Admin command | Action |
| --- | --- |
| `!pause`, `!resume` | Pause or resume the current video |
| `!forceskip` | Skip immediately, including during voting; ordinary `!skip` still casts a viewer skip vote |
| `!previous`, `!replay` | Play the previous video or restart the current video |
| `!seek SECONDS` | Seek to an absolute position, for example `!seek 90` |
| `!volume 0-100` | Change volume while preserving mute; zero also mutes |
| `!mute`, `!unmute` | Mute/unmute; unmuting at zero restores volume to 50 |
| `!add URL` | Add directly to Upcoming without request approval |
| `!playnext URL` | Add to Play Next |
| `!playnow URL` | Play immediately, parking interrupted playback to resume next |

Commands ignore capitalization. Video commands also accept a video ID and an optional ` | Display title`, such as `!add dQw4w9WgXcQ | Favorite`. Existing queue ordering and loop settings still apply. Pause, resume and seek are unavailable during voting. Chat cannot edit access, station settings, or the library through deletion or bulk imports.

Admin commands require Twitch's numeric sender identity tag and must originate in the configured channel; messages forwarded from another Shared Chat room are ignored. Both existing connection modes can receive commands when those tags are present. Repeated message IDs are ignored for five minutes. Allow two seconds between admin commands per account; the station accepts at most 30 per minute. The Chat Connections panel shows the latest 20 authorized attempts and their results, including usage errors and throttling. Activity clears when the server restarts. Ordinary chat messages are not stored, and no chat replies are sent.

## Windows automatic startup

1. Extract Playback into a permanent local folder such as `C:\Playback`, with Node installed for all users. Stop any manually launched Playback server, then run **INSTALL-AUTO-START.bat**, choose whether to open OBS automatically, then approve the administrator prompt. The backend starts at Windows boot under LOCAL SERVICE. The browser and optional OBS launch at Windows sign-in, after the backend is healthy.
2. Sign in to the dashboard once with **Keep signed in on this computer for 30 days** checked. Use the same Windows account, normal browser profile and `http://127.0.0.1:4177/control` address after reboot. The browser keeps a signed HttpOnly session cookie; the operator token is not stored in browser storage or startup URLs. Private browsing, cleared cookies, logout or the 30-day expiry require a new login.
3. In OBS, save the Browser Source URL as `http://127.0.0.1:4177/player`, disable **Shutdown source when not visible**, and keep the source active in your startup scene. Disable **Refresh browser when scene becomes active** for continuous playback. Do not open the player in a second regular browser tab.
4. If OBS already has its own Windows startup shortcut/task, remove that duplicate startup entry when using Playback's OBS launch option. Waiting for the server avoids OBS loading a connection-error page before Playback starts. The player retries YouTube API/iframe startup failures without a manual cache refresh once the page has loaded.
5. Restart Windows once to validate the actual workstation setup. **CHECK-AUTO-START.bat** reports task/server status; **UNINSTALL-AUTO-START.bat** removes the tasks without deleting data. Re-run the installer after moving the installation or changing startup options.

Windows must sign in to a desktop before the browser or OBS can run; the boot server alone does not render video. Windows automatic sign-in, if desired, is a separate workstation configuration. Playback's OBS launcher opens OBS with its saved scene; it does not start streaming or recording.

For a custom OBS install, run `powershell -NoProfile -ExecutionPolicy Bypass -File .\ops\register-autostart.ps1 -StartNow -StartOBSAtLogon -ObsPath "D:\OBS\bin\64bit\obs64.exe"` from the Playback folder.

## Data and backups

`DATA_DIR` overrides the default installation-local `data/` directory. Retain all token files, startup configuration and the database when upgrading. Once migrated, the old `state.json` is an archival snapshot and is no longer updated.

```sh
npm run backup
npm test
npm run check
npm run benchmark:storage
```

The backup command writes a verified database snapshot under `data/backups`. See [STORAGE.md](docs/STORAGE.md) for a safe restore procedure and the distinction between a database backup and a complete station backup.

## Operational scope

Playback binds to localhost by default and is intended for a trusted workstation, not a public multi-tenant service. Operator mutations require authentication. Public browser voter identities are not a replacement for account authentication. See [SECURITY.md](SECURITY.md).

Real YouTube availability, embed permissions, browser autoplay, Twitch connectivity, storage latency and OBS rendering must be checked on the streaming computer. An embeddable video is not permission to rebroadcast someone else's content. Source code is MIT licensed; names/logos and bundled third-party software have separate notices.
