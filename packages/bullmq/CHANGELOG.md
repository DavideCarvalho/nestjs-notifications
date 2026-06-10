# @dudousxd/nestjs-notifications-bullmq

## 0.2.1

### Patch Changes

- db1e3f0: Honor a notification's `delay` in the async dispatchers: BullMQ schedules the job natively,
  while the in-process event-emitter and Redis dispatchers defer with a timer.
