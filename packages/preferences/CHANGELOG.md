# @dudousxd/nestjs-notifications-preferences

## 0.4.0

### Minor Changes

- 1d9d52b: The controller factories (`createNotificationsController`, `createNotificationsStreamController`, `createPreferenceCenterController`) accept `guards` (applied via `@UseGuards`) and a custom `path`. The inbox/preferences/stream are per-user, so apps can now protect the auto-mounted endpoints with their auth guard.

## 0.3.0

### Minor Changes

- 67db54f: Add a full preference center: per-category × channel toggles, per-category digest frequency, mandatory categories, a category-aware PreferenceCenterGate, and an HTTP controller for a preferences UI.
