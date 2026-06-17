# PIP-BOY 3000

A full Android **launcher** styled after the Fallout Pip-Boy. The UI is the real,
exported **Pip-Boy Design System** (HTML/CSS/JS) rendered inside a native WebView
and bridged to Android system features, so your home screen looks and behaves like
a Pip-Boy terminal.

When installed and selected as your Home app, PIP-BOY 3000 replaces the stock
launcher with a green-phosphor terminal that lists your apps, contacts, call
history, and live device readouts.

## Features

- **App drawer + launching** — browse every installed app as an "inventory" and
  launch any of them.
- **Call log** — recent incoming/outgoing/missed calls.
- **Contacts + dialing** — browse contacts and place calls.
- **Device stats** — battery, storage, RAM, and a live clock on the STAT tab.
- **Quick settings / flashlight** — fast toggles for common controls.

## Architecture

```
┌──────────────────────────────────────────────┐
│  MainActivity (Kotlin)                         │
│   • Hosts a full-screen WebView                │
│   • WebViewAssetLoader serves bundled assets/  │
│     over https://appassets.androidplatform.net │
│                                                │
│   window.AndroidBridge  ◄──── JS bridge ────►  │
│   (com.pipboy3000.launcher.bridge.LauncherBridge)
│                                                │
│  Web UI in assets/ (Pip-Boy Design System)     │
│   • window.PipBoy components render the tabs    │
│   • calls AndroidBridge for system data/actions │
└──────────────────────────────────────────────┘
```

- **WebView host:** `MainActivity` loads the local web UI and wires up the bridge.
- **Asset serving:** `WebViewAssetLoader` exposes everything under `app/src/main/assets/`
  to the page, avoiding `file://` restrictions.
- **JS bridge:** the web UI talks to Android through `window.AndroidBridge`, backed by
  `com.pipboy3000.launcher.bridge.LauncherBridge`, which reads apps/contacts/call log/
  device stats and performs actions (launch app, dial, toggle flashlight, etc.).
- **Web UI:** the exported Pip-Boy design renders via `window.PipBoy` components.

## Permissions

The launcher requests only what its surfaces need:

| Permission | Why |
| --- | --- |
| `QUERY_ALL_PACKAGES` | Build a complete app drawer ("inventory"). |
| `READ_CALL_LOG` | Show recent call history on the DATA tab. |
| `READ_CONTACTS` | List contacts for browsing and dialing. |
| `CALL_PHONE` | Place calls from the dialer. |
| `READ_PHONE_STATE` | Telephony/device state for stats and dialing. |
| `EXPAND_STATUS_BAR` | Quick-settings style controls. |
| `SET_WALLPAPER` | Launcher wallpaper integration. |
| `VIBRATE` | Tactile feedback for terminal interactions. |

## Build

**Prerequisites:** JDK 17 and the Android SDK (API 34).

```bash
./gradlew assembleDebug
```

APK output:

```
app/build/outputs/apk/debug/app-debug.apk
```

### Signing

Every build is signed with a **constant `debug.keystore` committed at the repo
root** (alias `androiddebugkey`, store/key password `android`). This gives both
local and CI builds a stable, reproducible signature with no secrets required.

> This is a debug key for development and sideloading convenience only. **It is
> not a production signing key** and must not be used to publish a release.

## Continuous integration

The GitHub Actions workflow is **manual-only** (`workflow_dispatch`):

1. Open the **Actions** tab.
2. Select the **Build** workflow.
3. Click **Run workflow** (optionally choose `debug` or `release`).

When it finishes, download the APK from the run's **Artifacts** section
(`pipboy3000-debug-apk` / `pipboy3000-release-apk`). No signing secrets are
needed because the build uses the committed debug key.

## Install

```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

After installing, press Home (or open Settings → Apps → Default apps → Home app)
and choose **PIP-BOY 3000** as your launcher.

## Credits

UI built with the **Pip-Boy Design System**, exported from Claude Design.
