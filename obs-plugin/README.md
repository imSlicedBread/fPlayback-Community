# fKey Playback OBS plugin — 0.1.13 — OBS 32 and OBS 33

This native plugin opens a **normal YouTube watch page**, using OBS Browser's
default browser context. It does not use an iframe or a Chrome extension. Sign
in manually in its output window with the account that owns the membership.
The dashboard and whitelisted chat commands continue to control the same station.

**Members-only playback was verified by the user on October 20, 2026**, using
an entitled YouTube account signed in inside the native OBS plugin. This confirms
actual members-only video playback, beyond sign-in or private-playlist visibility.
The result applies to the tested account and video. The plugin uses the account's
existing access; account/age/content confirmations remain manual. The separate
Browser Source embedded-player workflow has not been verified for members-only playback.

## OBS 32 and OBS 33 builds

The plugin has separate Windows x64 builds. Installer 0.1.13 adds OBS 33.0.1 support. Use the installer matching your OBS version. Each build checks its matching CEF version and API hash.

| OBS | Chromium / CEF | Installer |
| --- | --- | --- |
| 32.2.2 / Qt 6.11.1 | Chromium 127.0.6533.120 / CEF 127.145.7 | `fKey-Playback-OBS-Plugin-Setup-0.1.13.exe` |
| 33.0.0 or 33.0.1 / Qt 6.11.1 | Chromium 150.0.7871.252 / CEF 150.0.20 | `fKey-Playback-OBS-Plugin-Setup-0.1.13-OBS33.exe` |

OBS 33 uses `core/obs-browser` for its built-in browser. This plugin still installs in the legacy third-party plugin folder supported by OBS 33. Neither installer replaces OBS, Chromium, or account data. The filtered child browser uses that OBS instance's existing global request context; no cookie copying, separate login store, extension or remote debugging port is introduced. OBS's own profile migration remains responsible for carrying a login across an OBS upgrade.

Build the OBS 33 variant with `./build-windows.ps1 -ObsMajor 33 -ObsPath 'C:/path/to/OBS-33'`. The default build targets OBS 32.2.2. Variant build/package folders and filenames remain separate.

The CEF 150 SDK is pinned to OBS 33.0.0's official `CMakePresets.json` SHA-256 (`54cd191a3f56bb1f05be22b95e1fa8041061b38bd5fe94e0776fb34dd599f341`). The OBS 33 source archive is pinned too; Qt 6.11.1 and the unchanged browser panel ABI are used by both variants.

## Experimental request filtering

The dock's **Interact with output** button temporarily enables mouse and keyboard input and restores the YouTube player controls. **Finish interaction** hides the controls and restores input locking. The selected output resolution and full-window player layout stay in place. Parking/closing the output, stopping it, or starting the queue ends interaction; interaction is never saved across restarts. These buttons live in the OBS dock, outside the captured output. Visible YouTube controls during interaction can appear on the broadcast.

**Experimental feature shipped with Playback v1.7.10.** Live testing on October 22, 2026 in OBS 32.2.2 loaded `UHCo5KfkUE4` using the existing signed-in profile. The dock reported an intercepted player response; the video filled the output, the OBS audio meter was active, pause held the position, and independent seek/resume controls worked. No ad or black-screen wait appeared during that load. A second live test with the user-identified ad-supported video `uWTzrV7Qpmw` reported **Player ad data filtered** and advanced through content playback (past 21 seconds) with a visible video picture. No ad wait was observed during that load. Playback also crossed 14:45 to 15:24 after seeking without an observed ad interruption. Seeking may not trigger the same scheduling as uninterrupted viewing; these spot checks do not establish complete ad coverage or long-duration mid-roll behavior. Members-only playback still needs verification with this filtered browser. Enable **Block ads before playback (experimental)** in the dock. This creates a filtered child browser inside OBS's already-initialized CEF runtime and uses its existing global request context. It does not initialize a second runtime, export cookies, move the account to another profile, or expose a remote debugging port. Playback's watch-page controller still handles the saved position, pause/resume, seeks and queue completion.

The browser configures internal Network/Fetch interception before navigating to YouTube. It blocks the listed ad-delivery URLs and removes recognized `adPlacements`, `playerAds` and `adSlots` data from the initial watch-page player data and selected player API responses. It leaves video details, signed media URLs and playability/access responses intact. It does not bypass membership, sign-in, age or content confirmations. This is targeted YouTube filtering, not the complete AdGuard filter engine; unrecognized ads or future player changes may still reach the player. The dock reports filtering failures.

Ad masking is disabled while request filtering is enabled, so a missed ad is not replaced with a black-screen wait. Turning request filtering off reloads the current page with the original filtering behavior; the separately saved masking option becomes available again. Failed response interception retains the original response, with bounded pending requests and body sizes.

When output is locked, recognized YouTube Premium marketing popups are hidden without clicking their buttons and the full-window player layout is restored. Actual access and confirmation prompts remain visible. Unlocking restores promotional elements' original styles.

Each CEF SDK is pinned to its matching runtime in the compatibility table, including an API-hash check before creating the browser. The build downloads the SHA-256-verified official SDK and rebuilds its wrapper with Qt's dynamic runtime. CEF's license is included under `vendor/CEF-LICENSE.txt`. Developer builds also require Python 3.10+ for the isolated loopback HTTPS fixture; the installed plugin does not require Python.

Automated acceptance uses real Chromium, an isolated temporary profile and a loopback HTTPS server: ad delivery blocked before reaching the server, initial/API ad data removed, cookie continuity across browser recreation, access responses and signed media URL preservation, Playback pause/resume/seek, Premium-popup layout recovery and browser shutdown. The fixture's host mapping, test TLS certificate and certificate-error switch exist only in the test executable, not the plugin. No live account credentials are used in automated tests.

## Ad Guard

Plugin 0.1.9 adds **Hide ad video + mute ad audio** to the dock. It is off by default for new installs and saved in OBS preferences. Existing saved choices are retained. When a YouTube ad is detected, the native Playback source outputs black video and silent audio while the queue checkpoint is held. Content returns after the player reports a ready content frame. The normal transition timeout cannot reveal a detected ad.

Ads still play and take their normal time in the signed-in output window. This setting masks the native OBS output; it does not skip ads or cover a separate Window Capture source. Disable it to show ads normally. Detection depends on YouTube player markers, so live ad behavior should be checked with your account. Sign-in and access/age/content confirmations remain manual.

## Install and test

Built for **Windows x64** with the OBS and Qt versions in the table above and
OBS Browser panel API 3. The plugin provides a dock, a watch
window and a native **Playback YouTube Output** video source. Its native source
uses OBS's Windows Graphics Capture library directly: ordinary Window Capture
excludes windows owned by OBS itself.

1. Close OBS. Back up your OBS scene collection/profile.
2. Double-click the matching installer from the table, approve the Windows
   administrator prompt, and click **Install / Update**. The installer detects
   the usual OBS installation; use **Browse** for a custom or portable folder.
   It checks the OBS, Qt and Chromium versions before installing. Start OBS from your usual
   shortcut after installation. No PowerShell commands or .NET install is needed.
   Manual installation remains available: copy `obs-plugins/64bit/fplayback-youtube.dll`
   from the ZIP into your OBS `obs-plugins/64bit` folder with OBS closed.
3. Start Playback and OBS. Open **Docks → fKey Playback**.
4. Disable/remove the station's existing `/player` Browser Source. It competes
   for the same playback lease; there can be only one playback controller.
5. Choose **Sign in / manage YouTube account**. Complete sign-in yourself in
   this window. Existing OBS Browser sign-in may already be available because
   the plugin uses its default context. This does not share Chrome's login.
6. Choose **Start queue / retry**, then **Add Playback source to current scene**.
   The plugin adds the video and a transparent `Playback Overlay`, sizes both
   to the OBS canvas, and puts the overlay above the video. Clicking again
   repairs a missing overlay and reuses existing sources without duplicates.
   Existing video transforms are preserved. Disable the old `Playback YouTube
   Capture` Window Capture source if you installed an earlier prototype.
7. The same **Playback YouTube Output** source now includes browser audio in the
   OBS mixer. Its first upgrade from the video-only prototype enables Track 1.
   Check the source is unmuted and your recording/stream uses that track. Keep
   audio monitoring off to avoid duplicate sound from the browser and OBS.
   Audio is limited to active sessions owned by this OBS instance's
   `obs-browser-page.exe` children; Chrome, Discord, microphones and general
   desktop audio are not targeted. Other audible OBS browser panels sharing
   the captured browser process may also be included, so mute unused panels.
8. Lower thirds and votes use the automatically added `/overlay` Browser
   Source. It never claims playback. Manual overlays using the configured
   station URL are reused, even when renamed. The button updates the managed
   overlay to the current station port and canvas size.
9. Optional: enable **Start this output when OBS opens**. Playback must also
   start with Windows using the station's existing startup setup. A stopped
   station is retried once a second after the queue is started.

Playback starts with **Lock output (size + controls)** enabled. The output uses
the selected output resolution (720p by default), ignores mouse/keyboard input, and hides ordinary
YouTube player controls to keep hovering or accidental clicks out of the OBS
picture. Minimize and Close park the locked window rather than stopping the queue.
To handle a YouTube prompt, uncheck the lock and choose **Show output window**;
interaction is visible in OBS while unlocked. Recheck the lock when finished.
**Sign in / manage YouTube account** unlocks it automatically; **Start queue / retry**
locks it again. Ads and access/confirmation dialogs are not hidden or accepted.

Keep the output window open. Windows stops painting genuinely minimized windows,
so its minimize action parks it entirely outside the virtual desktop instead
of restoring it visibly over OBS. Playback stays rendered; **Show output window** brings
it forward when you need to interact with YouTube. This does not enable capture
of a closed output or a locked Windows desktop.

YouTube access errors hold the current entry. Inspect the window, resolve access
manually, then choose **Start queue / retry**. There are no automatic clicks on
membership, age verification, content confirmation, consent, or sign-in dialogs.
Ads hold queue reporting and are not skipped or hidden by the controller.
Normal watch-page navigation, ads, and YouTube controls may be visible in capture.
The page layout/selectors can change and need future maintenance.

Test pause/resume, seek, replay, previous, force skip, audio, Play Next, Play Now
and interrupted-video resumption, plus a complete voting round. Then test a
members-only video using an entitled account. Check access still works after
restarting OBS. These live checks are not replaced by the automated tests.

## Long-running playback and renderer recovery

The plugin detects CEF renderer termination and recreate only Playback's browser, retaining the global account context, output window/resolution and saved queue checkpoint. Paused/voting state remains under station control. Renderer crashes share the existing three-recovery-attempts-per-five-minutes budget; repeated crashes hold for manual retry. Stop cancels pending retries. This cannot recover an entire OBS process crash.

Every five minutes while running, `[fplayback-resources]` records OBS-process private/working memory, handle count, pending HTTP requests and plugin uptime in the OBS log. These are whole-OBS measurements, including other plugins, not a per-Playback allocation or GPU-memory measurement. `[fplayback-browser]` records renderer termination codes.

Native acceptance includes an actual isolated renderer crash, account-cookie continuity after recreation, and 50 browser creation/closure cycles with process-tree memory and handle measurements. This short fixture uses synthetic video state and disables GPU; it is not a multi-day signed-in YouTube or GPU-memory soak. Station output acknowledgements expire and are capped at 256; title lookup caches/history are capped at 5,000 without removing titles saved in the queue.

## Browser runtime mismatch

The output checks CEF's version and API hash before creating a browser. The selected plugin variant must match both the OBS version and its browser runtime in the table above. If rejected, send support the exact dock diagnostic and the link from **Help → Log Files → Upload Current Log File**, together with the failing video URL. Do not replace Chromium DLLs individually or remove the API compatibility check. The installer now rejects missing or mismatched CEF version resources before replacing the plugin; the running plugin still verifies the API hash.

## Output resolution

Choose **Output resolution** in the fKey Playback dock and click **Apply**.
Presets are 1280×720, 1920×1080, 2560×1440 and 3840×2160, or choose **Match OBS
canvas** to use the current canvas dimensions, including portrait canvases.
The applied choice is saved for the next OBS restart. Existing installations
default to 720p. Click Apply again after changing the OBS canvas size.

This controls the native source's rendered pixel dimensions, with DPI-aware
window sizing. The size lock uses the selected resolution; you do not need to
unlock playback to change it. The watch-page controller requests standard 1080p when available, or the best
available lower resolution. This is separate from the rendered output size.
It checks late-arriving quality options and reasserts the preference at most
once every 15 seconds while outside Interact mode. The dock reports the video's
actual decoded height (for example, `Video: 1080p`), rather than just the requested
quality. Bandwidth, source availability and changes to YouTube's watch-page
controls can still affect the delivered quality. The overlay continues to use the
OBS canvas size. Sources added by the plugin fit to the canvas automatically;
if you manually transformed an older source, use OBS's Fit to Screen as needed.

## Playback watchdog

While the queue is running, the controller checks once a second. After 10 seconds
without playhead movement, or 30 seconds without a ready video, it requests a
reload of the same watch page. The station's saved position, audio and current
entry are reapplied. Recovery never skips, quarantines or deletes a video.
Intentional pauses, voting, advertisements, visible access/confirmation dialogs
and blocked autoplay suspend recovery. Sign-in and other pages are left alone.

Reloads have a 15-second cooldown and a maximum of three in five minutes. At the
limit, the output pauses and the dock asks you to inspect YouTube, then choose
**Start queue / retry**. That button resets the retry limit; changing to another
video also resets it. A completely unresponsive browser script, or navigation
away from the expected watch page, produces a dock notice after 20 seconds and
requires manual inspection/retry instead of a blind reload during sign-in.

Uninstall with OBS closed by removing only `fplayback-youtube.dll`. Restore the
regular `/player` source. OBS Browser manages the account session; the plugin
does not export, import, log, or copy Google cookies or account tokens.

## Windows installer

The standalone installer includes the plugin DLL, corresponding source ZIP and
GPL license. It installs only those three files, leaves OBS's own DLLs, scenes,
settings and browser sessions alone, and refuses to update while OBS is open.
Existing plugin/source/license files are backed up under
`data/obs-plugins/fplayback-youtube/backups` inside the OBS installation.
It verifies staged files before replacing anything and restores previous files
if replacement fails. The installed source is available at
`data/obs-plugins/fplayback-youtube/source.zip` for rebuilding or redistribution.

The plugin ZIP also includes the installer and uncompressed source. Both the
installer and ZIP have SHA-256 checksum files. The installer is built with the
static C++ runtime and uses Windows APIs; it needs neither the Qt SDK nor .NET
on the user's computer. It does not install OBS or start a stream/recording.

## Build

Install CMake ≥3.28 and Visual Studio 2026's Desktop development with C++ workload.
From PowerShell run `./obs-plugin/build-windows.ps1`. The script downloads pinned,
SHA-256 verified official OBS headers and OBS's Qt SDK, and verifies the vendored browser panel header.
It generates import libraries from the locally installed OBS DLL exports and
creates `obs-plugin/package/obs-plugins/64bit/fplayback-youtube.dll`.
Build caches and binary packages are ignored by Git. No installation is performed.

Run `npm test` and `npm run check` from the station directory. The watch-page
controller has simulated DOM tests and a real localhost worker-lease test.
The build also runs installer tests for fresh installs, backups, rollback,
locked files, folder validation and embedded resources, plus native recovery-policy and scene-setup tests against libobs
with test video/browser sources, covering reuse, stacking, canvas size, port
changes and unrelated sources.
Compilation does not verify rendering, Google login, or membership access in OBS.

Local live testing on OBS 32.2.2 confirmed reuse of the signed-in YouTube session,
public-video playback through the native video source, restart startup, pause,
seek, resume, automatic end-of-video advancement and changing progress/duration heartbeats. An age-restricted video
played on its normal watch page after the user manually accepted YouTube's
confirmation. Native browser audio was observed as non-silent PCM and a moving
OBS mixer meter. On October 20, 2026, the user also confirmed actual members-only
video playback through the native plugin with the signed-in, entitled account.

Plugin code in this directory is GPL-2.0-or-later (see LICENSE), consistent with
OBS's plugin API. The rest of the station retains its existing license. The
downloaded OBS/Qt SDKs retain their respective licenses. The browser panel header
is from obsproject/obs-browser commit
`23075aaed66df030d553d9ef603136e72127bffd`. Redistributing the binary requires
providing its corresponding plugin source and applicable license notices.

## Restoring windows after restart

OBS restores the dock layout and open state. Floating docks restored off-screen are moved into the monitor work area. The output window saves its position and parked state on normal OBS shutdown and restores them at startup. Render size follows the saved resolution. Show output window restores a parked output. Positions are adjusted for available monitors to keep title bars reachable. Locked playback hides the channel watermark alongside ordinary player controls; manual interaction, ads and access prompts restore original styles.

## Saved playback position

Videos open with the local queue checkpoint in the watch URL. The controller seeks to that checkpoint and rejects implausible browser-history jumps during the first ten seconds after position initialization. Pending seeks and rejected jumps do not report progress or completion. Ads and access prompts hold the queue checkpoint, which is reapplied afterward. New dashboard seek/replay generations establish a new checkpoint. Ordinary later manual seeks remain available when unlocked. This protects future startup reports; it cannot recover an older checkpoint already replaced before upgrading.

## Video transitions and pause

The native OBS source caches the outgoing picture during a queued video change. It waits for a decoded frame and a full-window layout stable for 500 ms, then crossfades over 300 ms. Layout changes withdraw readiness. Ads/access prompts are revealed when reported, and a 15-second loading timeout releases the held picture for inspection. Stop/sign-in cancels a pending fade; rapid queue changes replace the pending transition. First startup has no outgoing frame to blend. This is a visual transition in the native source, not an audio crossfade or preloading system; audio keeps its existing routing. The separate YouTube output window may still show page loading.

Pause/resume commands now preserve the current browser frame and do not seek back to the last progress report. Seek, replay, startup restoration and history-resume protection retain their behavior. Update both the app and plugin to use the pause fix.

## Stopping and cleanup

Stop output closes the dedicated browser/window, releases its worker lease, cancels pending requests/retries and releases capture textures and browser audio capture. Start queue / retry recreates the output using the existing account session and saved placement. OBS shutdown closes the output before its scene/browser teardown and joins the audio capture thread. Shared OBS browser processes may remain while other OBS sources use them; the plugin does not terminate unrelated processes. Minimizing or closing a locked output still parks it intentionally so capture can continue; use Stop output to release it.

Plugin 0.1.12 synchronizes the lower-third title with the visible video after the crossfade. Update the station to v1.7.13 as well. Older browser outputs retain their existing behavior.

## Station connection warning

OBS and the Playback station are separate programs. Start `start-player.bat` in the Playback folder and leave it running, or install the station's Windows automatic startup task. The plugin checks station health even when output auto-start is off. A red banner opens the fKey Playback dock when the station is missing, unreachable, or on a different port. A connected station does not mean the output is playing; check the output status beneath it.

If the station disappears during playback, the plugin pauses the video and silences its OBS audio until a valid station and queue connection returns. Reconnection resumes the saved station checkpoint. Checks use bounded requests and do not start another station process.

## Optional Twitch stream restart

In the fKey Playback dock, **Restart Twitch stream before 48h** is off by default. When enabled, the plugin stops OBS's main Twitch stream at 47 hours 55 minutes, waits two minutes after OBS confirms it has stopped, then starts it again. The two-minute gap exceeds Twitch's 90-second disconnect-protection window so a new broadcast can begin. Playback keeps its queue and video running during the offline gap.

Start the initial stream manually. This option controls the main OBS Twitch service (including recognized direct Twitch ingest URLs), not multistream plugin outputs or other platforms. The dock shows the next restart or pending reconnect; uncheck the option to cancel. Manual stream stops do not restart automatically. Changing the service/profile, stopping the Playback output, disabling the option, or exiting OBS cancels a pending restart. A failed stop/start is not retried indefinitely, and an unavailable Playback station/output prevents a scheduled reconnect. The setting is saved across OBS restarts, but no broadcast is started merely by opening OBS.

The scheduling policy is tested using accelerated monotonic time, including the 47h55m boundary, two-minute gap, manual stops, cancellation, service changes and failures. A real 48-hour Twitch broadcast has not been tested. See [Twitch broadcasting guidelines](https://help.twitch.tv/s/article/broadcasting-guidelines) and [Disconnect Protection](https://help.twitch.tv/s/article/Disconnect-Protection).
