# Testing and maintenance

## Existing test/support scripts

Server package declares manual Node scripts: `test:db`, `test:auth`, `test:gemini`, `test:transcription`, `test:analysis`, `test:relationships`, `test:map`, `test:part9`, `test:part10`, `test:part11`, `test:forgot-password`, `test:audio-lecture`. Other scripts seed data, probe/generate audio and inspect user lectures. These may require credentials, database access or real provider calls; inspect before running. No test framework is declared and client has no test script. No tests were run for this documentation task.

## Maintenance guidance

When routes/controllers change, update [API](api.md) and [backend](backend.md). Schema changes require updating [database](database.md) and ERD; route/page changes update [frontend](frontend.md). Keep this coverage table aligned with `rg --files` and registered routes.

## Known gaps

- Versions are ranges; Node runtime is unpinned.
- README endpoint/routes section is stale and references absent `.env.example`.
- Script names such as `part9/10/11` do not prove a production feature; controllers are source of truth.
- No worker/queue/scheduler, object storage, backups/retention, CI or frontend test harness found.
- External provider behavior requires real credentials/account configuration.
- Exact response/error contracts should be checked in controllers when changing APIs.
