---
"@dudousxd/nestjs-notifications-event-emitter": patch
"@dudousxd/nestjs-notifications-bullmq": patch
"@dudousxd/nestjs-notifications-redis": patch
---

Honor a notification's `delay` in the async dispatchers: BullMQ schedules the job natively,
while the in-process event-emitter and Redis dispatchers defer with a timer.
