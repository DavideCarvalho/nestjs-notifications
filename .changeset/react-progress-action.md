---
"@dudousxd/nestjs-notifications-react": minor
---

Add generic `progress` and `action` conventions to the inbox. New pure helpers
`notificationProgress(item)` (reads a 0–100 `data.progress`, accepting numeric
strings) and `notificationAction(item)` (reads `data.action: { label, url }` or
flat `actionUrl`/`downloadUrl` + `actionLabel`) are exported for custom
renderers, and the built-in `Inbox` row now renders a progress bar for
long-running notifications and a download/action link when present.
