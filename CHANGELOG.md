# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions use a `YEAR.RELEASE.PATCH` scheme.

## [2026.1.0] - 2026-07-04

First release under the new name **Always Online for Mattermost** (versioned above the
previous store release `2025.1.0`).

### Added
- **Proactive keep-alive** that refreshes presence every interval instead of only
  reacting after the status has already flipped to "away".
- **Automatic instance detection**: the instance and user are learned from your
  Mattermost API traffic, with no manual "scan" step.
- **Working-hours schedule** to choose the days and time window during which to stay
  online.
- **Respect Do Not Disturb**, so a manually-set DND is never overridden.
- **Live status panel**: current status, detected instance, last check time, and a
  correction counter.
- **Dynamic toolbar icon** (blue when on, grey when off) plus an amber "!" badge when
  setup is still needed.
- **Light / dark / system theme.**
- **Internationalisation** with automatic English and German based on the browser
  language, plus a manual language override in the settings.
- **Configurable check interval** via a custom dropdown.
- **Stored-data view** on its own page with a **Delete stored data** action.
- A clean, minimal light/dark popup with **fixed-height page navigation** (Settings
  and Stored data are separate pages, so the popup never needs to scroll) and
  animated toggle switches.
- A separate **Firefox build** under `firefox/` sharing the same code as the
  Chrome build.

### Changed
- Consolidated the duplicated status logic into a single background worker.
- Authentication now relies solely on session cookies; the misused `X-Request-Id`
  header was removed.
- The stored auth token is redacted in the "Stored data" view.
- Shared code is cross-browser (`browser`/`chrome`), so Chrome and Firefox run the
  same scripts.

[2026.1.0]: https://github.com/Kianyce/always-online-for-mattermost/releases
