# Always Online for Mattermost

A lightweight browser extension that keeps your **Mattermost** presence set to
**online**, so inactivity never makes you look "away" or offline.

> Works on any Mattermost instance. Your session never leaves your browser; the
> extension talks only to the Mattermost server you are already logged in to.

## Features

- **Proactive keep-alive.** Refreshes your presence every couple of minutes so the
  inactivity timer never trips, instead of only reacting once you are already "away".
- **Automatic instance detection.** Open your Mattermost tab once and the extension
  picks up the server and your user automatically. No manual setup.
- **Working-hours schedule.** Optionally stay online only on the days and hours you
  choose (for example Mon to Fri, 08:00 to 17:00), so you are not online at 3 a.m.
- **Respects Do Not Disturb.** A DND status you set yourself is never overridden.
- **Live status panel.** Current status, detected instance, last check, and how many
  times your status was corrected.
- **On/off in the toolbar.** The toolbar icon turns blue when active and grey when
  off; an amber "!" badge means "open your Mattermost tab".
- **Light and dark theme.** Follows your system by default, or force light/dark.
- **Multilingual.** English and German, chosen automatically from your browser or
  set manually in the settings.
- **Configurable interval**, and a one-click way to view or delete stored data.

## Project structure

Each browser engine has its own self-contained, loadable build folder. They share
the exact same code (`defaults.js`, `background.js`, `popup.*`, `styles.css`,
`icons/`, `_locales/`); only `manifest.json` differs (a service worker for Chromium,
background scripts + a Gecko id for Firefox).

```
chromium/   Chrome / Edge / Brave build
gecko/      Firefox build (same code, Gecko manifest)
build.ps1   syncs chromium/ into gecko/ and packages both into dist/*.zip
dist/       release zips (build output, git-ignored)
```

Edit the shared code in `chromium/`, then run `./build.ps1` to sync `gecko/` and
rebuild the release zips.

## Install (unpacked)

**Chrome / Edge / Brave**

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `chromium/` folder.

**Firefox** (temporary, for development)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and select `gecko/manifest.json`.

Prefer packaged builds? Run `./build.ps1` and use the zips in `dist/` (these are also
what you attach to a GitHub release or upload to the extension stores).

Then pin the extension, open your Mattermost tab once, open the popup and flip
**Keep me online** on.

## How it works

- A background worker watches your Mattermost API traffic to learn the instance and
  your user id (from the `MMAUTHTOKEN` / `MMUSERID` session cookies).
- On a timer it reads your status and, unless you have set Do Not Disturb, pushes it
  back to `online` via the Mattermost REST API.
- Requests authenticate purely with the cookies your browser already holds; nothing
  is stored remotely and no credentials are sent anywhere except your own server.

## Privacy

All data (instance domain, user id, session token) stays in your browser's local
storage and is used only to call your own Mattermost instance. Nothing is collected,
transmitted to third parties, or shared. You can clear it anytime via
**Stored data > Delete stored data**.

## Versioning

Versions use a `YEAR.RELEASE.PATCH` scheme (e.g. `2026.1.0`). See
[CHANGELOG.md](CHANGELOG.md) for the release history. Current version: **2026.1.0**.

## License

Released under the [MIT License](LICENSE).

## Disclaimer

Use responsibly and in line with your organisation's policies. An "online" indicator
reflects presence, not actual activity.
