# pi-codex-usage

Codex usage status extension for [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent).

## What it does

Adds a footer status entry showing Codex usage windows:
- 5h % left (default)
- 7d % left (default)
- optional 7d reset countdown
- optional `% used` mode via `/codex-usage-mode used`
- automatically switches label to `Codex Spark` when model `gpt-5.3-codex-spark` is selected
- when on Spark, it queries `/api/codex/usage` only (no fallback to `/backend-api/wham/usage`)
- when on Spark, uses Spark-specific limit buckets when present (otherwise uses that endpoint's default `rate_limit` bucket)

If Codex auth is missing, it renders nothing (no status bar space used).

## Local development

```bash
pi -e ./extensions/codex-usage-status.ts
```

Switch display mode at runtime:

- `/codex-usage-mode` (toggle)
- `/codex-usage-mode left` → `Codex 5h:81% left 7d:64% left`
- `/codex-usage-mode used` → `Codex 5h:19% used 7d:36% used`

`/codex-usage-mode` also provides argument autocomplete with these exact format examples.

When model `gpt-5.3-codex-spark` is selected, the same formats are shown with the `Codex Spark` title.

Or install as a local package:

```bash
pi install /Users/cale/dev/pi-codex-usage
```

## Notes

- When you're ready to publish, set `private` to `false` and choose your publish target (private npm scope or private git repo).
