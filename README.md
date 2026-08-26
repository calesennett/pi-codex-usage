# pi-codex-usage

![pi-codex-usage screenshot](https://github.com/user-attachments/assets/edb4b114-13ba-46f5-b7ab-cdcb28a8865c)

Footer status extension for [pi](https://github.com/earendil-works/pi-mono/tree/main/packages/coding-agent) that shows the available Codex usage windows.

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

- A response with only a primary window → `Codex 7d:97% left (↺6d22h)`
- A response with a secondary window → `Codex 5h:81% left (↺2h10m) 7d:64% left (↺6d22h)`
