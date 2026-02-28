# pi-codex-usage

![pi-codex-usage screenshot](https://raw.githubusercontent.com/calesennett/pi-codex-usage/main/assets/pi-codex-usage-screen.png)

Footer status extension for [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) that shows Codex (and Codex Spark) usage windows.

## Install

```bash
pi install npm:@calesennett/pi-codex-usage
```

## Commands

| Command | Effect |
| --- | --- |
| `/codex-usage-mode` | Toggle display mode (`left` ↔ `used`). |
| `/codex-usage-mode left` | Show percent left in each window. |
| `/codex-usage-mode used` | Show percent used in each window. |
| `/codex-usage-reset-window` | Toggle reset countdown window (`7d` ↔ `5h`). |
| `/codex-usage-reset-window 7d` | Show reset countdown for the 7d window. |
| `/codex-usage-reset-window 5h` | Show reset countdown for the 5h window. |

## Settings

The extension persists display preferences in pi's `settings.json` under:

```json
{
  "pi-codex-usage": {
    "usageMode": "left",
    "refreshWindow": "7d"
  }
}
```

- Settings file path: `$PI_CODING_AGENT_DIR/settings.json`
- Fallback when env var is unset: `~/.pi/agent/settings.json`
- Defaults are written on first load: `usageMode: "left"`, `refreshWindow: "7d"`

Example outputs:

- `/codex-usage-mode left` → `Codex 5h:81% left 7d:64% left (7d:↺22h28m)`
- `/codex-usage-mode used` → `Codex 5h:19% used 7d:36% used (7d:↺22h28m)`
