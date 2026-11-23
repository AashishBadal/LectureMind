# External integrations

## Gemini

`@google/generative-ai` `^0.21.0`; `services/gemini/client.js` reads `GEMINI_API_KEY`. Models are configurable by `GEMINI_TEXT_MODEL` and `GEMINI_AUDIO_MODEL`. Services separately implement transcription, summarization, analysis, concepts, relationships and map generation. RAG calls Gemini Embeddings for 1536-dimensional passage and question vectors; the embedding model and dimensions must match pgvector, and changing them requires re-indexing. `geminiErrors.js` normalizes generation errors. Credentials remain server-side. Quotas, retention and model availability depend on provider account.

## eSewa

`services/esewa.service.js` plus payment controller implement EPAY v2 initiation/status verification. Config keys: gateway URL, product code, secret, status-check URL; defaults are test values. Payment stores unique transaction UUID, amount, credits, gateway reference/status and optional raw response. Browser return data should not be treated as settlement without server verification. Live merchant setup and production endpoints are external requirements.

## Email and database

`services/email.service.js` uses Nodemailer SMTP for reset messages (controller identifies Brevo SMTP). It reads `BREVO_SMTP_HOST` (default `smtp-relay.brevo.com`), `BREVO_SMTP_PORT` (587), `BREVO_SMTP_USER` or `SMTP_USER`, `BREVO_SMTP_KEY`/`BREVO_SMTP_PASS` or `SMTP_PASS`, and `BREVO_SMTP_FROM` or `SMTP_FROM`. Without user/password, sending fails. Mail failures are returned to requester and no retry queue exists. Prisma provider is PostgreSQL; README mentions Neon, but deployment host is supplied by URLs.
