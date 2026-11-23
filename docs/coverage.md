# Coverage matrix and file reference

| Feature/module | Source of truth | Docs |
|---|---|---|
| Bootstrap/routes/theme | `client/src/main.jsx`, `App.jsx`, `context/`, `components/` | [Frontend](frontend.md) |
| Auth and reset | `auth.routes.js`, `auth.controller.js`, `utils/auth.js`, AuthContext | [Backend](backend.md), [Security](security.md), [API](api.md) |
| Lecture/upload/transcript | lecture routes/controller, upload middleware, Upload/Lectures pages | [Backend](backend.md), [API](api.md) |
| AI/map/chat and transcript retrieval index | `services/gemini/*`, `services/rag/*`, lecture controller, `LearningMapCanvas.jsx` | [Backend](backend.md), [Database](database.md), [Integrations](integrations.md) |
| Subjects/invites | subject routes/controller, subject pages | [Backend](backend.md), [API](api.md) |
| Credits/payment | payment controller/service, modal/return pages | [Backend](backend.md), [Integrations](integrations.md) |
| Schema/migrations | Prisma schema and migration SQL | [Database](database.md) |
| Config/build/scripts | package manifests, env, Vite/Tailwind config | [Setup](setup.md), [Maintenance](maintenance.md) |

## Project-owned path guide

| Path | Responsibility |
|---|---|
| `client/src/pages/*.jsx` | 16 route page components |
| `client/src/components/*.jsx` | Layout, navigation, route guards, payment modal, map canvas |
| `client/src/context/*.jsx` | Auth and theme contexts |
| `client/src/services/api.js` | Fetch wrapper and API functions |
| `client/src/App.jsx`, `main.jsx` | Route declarations and bootstrap |
| `client/src/index.css`, `client/*.config.js` | Global styles and Vite/Tailwind/PostCSS config |
| `server/src/server.js` | Express setup and listener |
| `server/src/routes/*.js` | Route registration |
| `server/src/controllers/*.js` | Input handling, business logic, persistence and responses |
| `server/src/middleware/*.js` | Authentication, upload and error handling |
| `server/src/services/gemini/*.js` | AI workflows |
| `server/src/services/*.js` | DB helper, SMTP and payment integration |
| `server/src/config/*.js`, `utils/*.js` | Environment/Prisma setup, auth and logging helpers |
| `server/prisma/schema.prisma`, `migrations/` | Database models and migration |
| `server/scripts/*.js` | Manual integration, seed and diagnostic utilities |
| package manifests/lockfiles | Dependency ranges and commands |
| `README.md` | Original quick start; portions are now stale |
| `opencode.jsonc`, `.gitignore` | Tool configuration and ignore rules |

Generated/dependency internals and binary sample audio are excluded from file-by-file coverage.
