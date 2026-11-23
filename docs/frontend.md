# Frontend guide

## Bootstrap, routing and state

`client/src/main.jsx` mounts `App` under BrowserRouter and StrictMode. `App.jsx` wraps routes in ThemeProvider and AuthProvider. `AuthContext.jsx` requests `/auth/me` at startup and exposes login, register, logout, refreshUser and credit updates. `ThemeContext.jsx` manages theme. Pages own local state; there is no Redux or query-cache package.

| URL | Page | Access/purpose |
|---|---|---|
| `/` | `Home.jsx` | Public landing |
| `/login`, `/register` | `Login.jsx`, `Register.jsx` | Guest-only account flows |
| `/forgot-password`, `/reset-password` | matching pages | Guest-only recovery |
| `/dashboard` | `Dashboard.jsx` | Authenticated overview |
| `/subjects` | `Subjects.jsx` | Subject list/create |
| `/subjects/:id` | `SubjectDetail.jsx` | Subject, members, lectures |
| `/join/:inviteCode` | `JoinSubject.jsx` | Invite preview/join; route is not wrapped by ProtectedRoute |
| `/upload` | `Upload.jsx` | Audio/lecture submission |
| `/lectures` | `Lectures.jsx` | Library/search |
| `/lectures/:id` | `LectureDetail.jsx` | Transcript, AI outputs, map, bookmarks/chat/export |
| `/payment/success`, `/payment/failure` | matching pages | Payment return states |
| `*` | `NotFound.jsx` | Unknown route |

All are rendered inside `Layout.jsx`. `ProtectedRoute` waits for auth initialization and redirects to login; `GuestRoute` redirects signed-in users to dashboard. These are UX guards; backend middleware remains the access boundary.

## API and components

`services/api.js` uses `VITE_API_BASE_URL` or `/api`, fetch with `credentials:'include'`, JSON parsing and an enriched Error for non-2xx responses. FormData omits explicit content type so the browser sets the multipart boundary. Pages call service functions directly and handle loading/error/result state locally.

Shared components: `Layout`, `Navbar`, `ProtectedRoute`, `GuestRoute`, `PaymentModal`, `LearningMapCanvas`. Styles are in `index.css` and Tailwind config; build config is Vite/PostCSS. `lucide-react` provides icons. `LectureDetail` coordinates lecture subresources; `LearningMapCanvas` renders and edits map data. `PaymentModal` loads packages and initiates payment. No automated frontend tests or accessibility audit were found.

