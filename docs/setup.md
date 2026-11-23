# Setup and configuration

## Local development

Node/npm compatible with Vite 5 and Prisma 5; PostgreSQL connection required. The RAG migration enables PostgreSQL's `vector` extension; the database provider must permit pgvector and HNSW indexes. README recommends Node 18+. For server: `cd server`, `npm install`, configure environment, `npm run prisma:generate`, then `npm run prisma:migrate` after DB credentials are set, followed by `npm run dev` (default port 5000). In another terminal: `cd client`, `npm install`, `npm run dev` (Vite default 5173). Health endpoint is `/api/health`. Client API base defaults to `/api`; Vite proxy config is `client/vite.config.js`; direct API can use `VITE_API_BASE_URL`.

## Environment variables

| Variable | Default/use |
|---|---|
| `PORT` | 5000 |
| `NODE_ENV` | development; logging and listener test guard |
| `CLIENT_URL` | localhost:5173; CORS/reset URL |
| `DATABASE_URL`, `DIRECT_URL` | PostgreSQL pooled/direct URLs |
| `GEMINI_API_KEY` | Empty; required for AI |
| `GEMINI_TEXT_MODEL` | `gemini-3.6-flash` |
| `GEMINI_AUDIO_MODEL` | `gemini-3.5-transcribe` |
| `JWT_SECRET` | Source fallback exists; set production secret |
| `JWT_EXPIRES_IN` | `7d` |
| `ESEWA_GATEWAY_URL` | Test EPAY v2 URL |
| `ESEWA_PRODUCT_CODE` | `EPAYTEST` |
| `ESEWA_SECRET_KEY` | Test fallback exists |
| `ESEWA_STATUS_CHECK_URL` | Test status URL |
| `BREVO_SMTP_HOST`, `BREVO_SMTP_PORT` | SMTP host/port; defaults Brevo relay / 587 |
| `BREVO_SMTP_USER`, `BREVO_SMTP_KEY`, `BREVO_SMTP_PASS` | Preferred SMTP credentials |
| `SMTP_USER`, `SMTP_PASS` | Fallback SMTP credentials |
| `BREVO_SMTP_FROM`, `SMTP_FROM` | Sender identity options |
| `VITE_API_BASE_URL` | Client; `/api` |

README references `server/.env.example`, but no such file is checked in. Do not commit credentials.

## Build and deployment

Client scripts: `dev`, `build`, `preview`. Server: `start`, `dev`, Prisma generate/migrate/push/studio/status, and manual integration scripts. No Dockerfile, CI workflow, hosting manifest or production topology was found. TLS, proxy, backups and scaling are Unknown / Requires Verification.
