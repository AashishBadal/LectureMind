# Security and access control

Passwords use bcryptjs (`utils/auth.js`). JWT signing uses `JWT_SECRET`, expiry defaults to 7d. Auth cookie is HTTP-only; Bearer JWT is also supported. Login/register return the token in JSON as well as setting cookie. Logout clears the cookie; no server-side revocation list exists. `requireAuth` reloads user and omits passwordHash. ProtectedRoute is only a client-side UX guard; server checks are authoritative.

Lecture endpoints all require auth and controller checks access by owner or subject membership. Subject details require teacher/member access; deletion is teacher-authorized. Invite preview and payment verify use optional auth.

JSON and URL-encoded parser limits are 100 MB. Upload restrictions are in `middleware/upload.js`; auth validates basic email/password fields. CORS constructs allowed origins but its callback currently returns allowed for all origins, with credentials enabled; tighten before deployment. `env.js` provides fallback JWT and eSewa test secrets; production merely warns about missing critical settings. Use strong environment secrets; HTTPS/proxy cookie configuration is not verified.

OTP hashes are SHA-256(email:OTP), expiry 15 minutes and at most two recent hashes. Generation uses `Math.random`; no rate limiting or attempt counter was found. Forgot-password returns 404 for unknown email, disclosing account existence. These are implementation facts to consider when hardening.
