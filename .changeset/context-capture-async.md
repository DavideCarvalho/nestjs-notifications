---
"@dudousxd/nestjs-notifications-bullmq": minor
"@dudousxd/nestjs-notifications-redis": minor
---

Carry the captured trigger context across the worker boundary. The job payload now includes the `captured` context (JSON-safe), and the BullMQ processor / Redis worker re-establish it on the channel runner — so an async-delivered notification still records WHO triggered it (causer/tenant/trace). The serialization carrier is provided by core; this just rehydrates it.
