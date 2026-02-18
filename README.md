# pi-codex-usage

![pi-codex-usage screenshot](https://raw.githubusercontent.com/calesennett/pi-codex-usage/main/assets/pi-codex-usage-screen.png)

Codex usage status extension for [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent).

## Installation instructions

```bash
pi install npm:@calesennett/pi-codex-usage
```

## What it does

Adds a footer status entry showing Codex usage windows:
- 5h % left (default)
- 7d % left (default)
- reset countdown defaults to weekly window, shown as `(7d:↺...)`
- optional `% used` mode via `/codex-usage-mode used`
- optional reset countdown window via `/codex-usage-reset-window 5h` or `/codex-usage-reset-window 7d`
- automatically switches label to `Codex Spark` when model `gpt-5.3-codex-spark` is selected
- when on Spark, uses Spark-specific buckets from `additional_rate_limits` (e.g. `GPT-5.3-Codex-Spark` / `limit_name`)

If Codex auth is missing, it renders nothing (no status bar space used).

## Local development

```bash
pi -e ./extensions/codex-usage-status.ts
```

Switch display mode at runtime:

- `/codex-usage-mode` (toggle)
- `/codex-usage-mode left` → `Codex 5h:81% left 7d:64% left (7d:↺22h28m)`
- `/codex-usage-mode used` → `Codex 5h:19% used 7d:36% used (7d:↺22h28m)`

Switch reset countdown window at runtime:

- `/codex-usage-reset-window` (toggle between `7d` and `5h`)
- `/codex-usage-reset-window 7d` → `(... 7d:... (7d:↺22h28m))`
- `/codex-usage-reset-window 5h` → `(... 7d:... (5h:↺1h12m))`

Both commands provide argument autocomplete.

When model `gpt-5.3-codex-spark` is selected, the same formats are shown with the `Codex Spark` title.
