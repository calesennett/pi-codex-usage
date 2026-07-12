# pi-codex-usage

![pi-codex-usage screenshot](https://github.com/user-attachments/assets/edb4b114-13ba-46f5-b7ab-cdcb28a8865c)

Footer status extension for [pi](https://github.com/earendil-works/pi-mono/tree/main/packages/coding-agent) that shows Codex 7-day usage.

## Install

```bash
pi install npm:@calesennett/pi-codex-usage
```

## Commands

| Command | Effect |
| --- | --- |
| `/codex-usage-mode` | Toggle display mode (`left` ↔ `used`). |
| `/codex-usage-mode left` | Show percent left. |
| `/codex-usage-mode used` | Show percent used. |

## Settings

The extension persists the display preference in pi's `settings.json` under:

```json
{
  "pi-codex-usage": {
    "usageMode": "left"
  }
}
```

- Settings file path: `$PI_CODING_AGENT_DIR/settings.json`
- Fallback when the environment variable is unset: `~/.pi/agent/settings.json`
- The default is `usageMode: "left"`.

Example outputs:

- `/codex-usage-mode left` → `Codex 7d:97% left (↺6d22h)`
- `/codex-usage-mode used` → `Codex 7d:3% used (↺6d22h)`
