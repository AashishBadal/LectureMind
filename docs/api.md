# API reference

Base path `/api`. Routes below reflect `server/src/routes`; exact response and validation fields are defined by the named controllers. Protected calls accept cookie or `Authorization: Bearer <JWT>`. Client sends cookies. Audio multipart field is `audio`.

| Method | Path | Auth | Handler/behavior |
|---|---|---|---|
| GET | `/health` | No | Health, uptime, timestamp |
| POST | `/auth/register` | No | name,email,password; 201, welcome credits |
| POST | `/auth/login` | No | email,password |
| POST | `/auth/logout` | No | Clear cookie |
| GET | `/auth/me` | Yes | Current safe user |
| POST | `/auth/forgot-password` | No | email; send OTP |
| POST | `/auth/verify-otp` | No | email,otp |
| POST | `/auth/reset-password` | No | email+otp or token, newPassword |
| GET | `/ai/status` | No | AI connectivity status |
| POST | `/ai/test-analyze` | Yes | Analysis diagnostic |
| GET | `/lectures` | Yes | List; optional `search` query |
| POST | `/lectures` | Yes | Create lecture; audio multipart or controller-supported JSON |
| GET/DELETE | `/lectures/:id` | Yes | Read/delete lecture |
| GET | `/lectures/:id/export` | Yes | Export; `format` query |
| POST | `/lectures/:id/transcribe` | Yes | Transcribe; optional audio field |
| GET/PUT | `/lectures/:id/transcript` | Yes | Read/update transcript |
| POST | `/lectures/:id/analyze` | Yes | Generate analysis |
| GET | `/lectures/:id/summary` | Yes | Read summary |
| GET | `/lectures/:id/concepts` | Yes | Read concepts |
| POST/GET | `/lectures/:id/relationships` | Yes | Extract/list relations |
| POST/GET/PUT | `/lectures/:id/learning-map` | Yes | Generate/read/update (`mapData`) |
| GET/POST | `/lectures/:id/bookmarks` | Yes | List/create bookmarks |
| DELETE | `/lectures/:id/bookmarks/:bookmarkId` | Yes | Delete bookmark |
| POST | `/lectures/:id/chat` | Yes | Question/history grounded chat |
| POST | `/lectures/:id/index` | Yes | Rebuild transcript passage index; owner or subject member |
| GET | `/subjects/invite/:inviteCode` | Optional | Invite preview |
| POST/GET | `/subjects` | Yes | Create/list subjects |
| POST | `/subjects/join` | Yes | Join by inviteCode |
| GET/DELETE | `/subjects/:id` | Yes | Read/delete (membership/teacher gated) |
| GET | `/payments/packages` | No | Packages and credit rules |
| POST | `/payments/initiate` | Yes | packageId; start payment |
| POST | `/payments/verify` | Optional | Verify gateway return |
| GET | `/payments/history` | Yes | Credit history |

## Verified validation examples

Registration requires nonblank name, simple email regex and password ≥6; duplicate email is 409. Missing login fields 400; invalid credentials 401. Forgot-password validates email and returns 404 for absent accounts, 500 for SMTP failure. Invalid/expired OTP returns 400. Subject creation requires nonblank name. Subject detail returns 404 if missing and 403 if unauthorized. Auth middleware returns 401 for absent/invalid sessions. Other endpoint-specific status and body details should be read directly in `server/src/controllers/*.controller.js`; this reference intentionally does not infer uniform contracts.

```http
POST /api/auth/login
Content-Type: application/json

{"email":"learner@example.test","password":"example-password"}
```

```json
{"success":true,"message":"Login successful.","user":{"id":"…","name":"…","email":"…","credits":10,"createdAt":"…","updatedAt":"…"},"token":"…"}
```
