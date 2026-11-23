# LectureMind — Evidence-grounded lecture intelligence

LectureMind turns classroom recordings and notes into structured, searchable learning material. Learners can explore one lecture with a cited tutor or ask a Research Lab question across the lectures they are authorized to access.

---

## 🏗️ System Architecture

```
lecturemind/
├── client/                     # React Frontend (Vite + Tailwind CSS + React Router)
├── server/                     # Node.js + Express Backend REST API
│   ├── prisma/                 # Prisma ORM Schema configured for Neon PostgreSQL
│   └── src/
│       ├── config/             # Environment & Prisma client configuration
│       ├── controllers/        # Express request controllers
│       ├── middleware/         # Custom middleware (error handling, validation)
│       ├── routes/             # API routes
│       ├── services/           # Core domain services
│       │   └── gemini/         # Modular Google Gemini AI service architecture
│       ├── utils/              # Utility functions & logging
│       └── server.js           # Server entry point
├── README.md
└── .gitignore
```

---

## 🛠️ Mandatory Tech Stack

- **Frontend**: React.js (JavaScript), React Router v6, Tailwind CSS
- **Backend**: Node.js, Express.js (JavaScript, ES Modules), REST API
- **Database**: PostgreSQL on [Neon](https://neon.tech), Prisma ORM
- **AI Engine**: Google Gemini API via Google AI Studio
- **Audio transcription**: Gemini audio transcription with timestamped transcript segments
- **Lecture research**: PostgreSQL `pgvector` semantic retrieval combined with PostgreSQL full-text search

## Product capabilities

- Audio-to-transcript workflow with timestamped segments and persistent lecture playback
- AI summaries, concept extraction, and editable concept relationship maps
- Lecture-scoped RAG tutor with transcript-grounded citations
- **Research Lab:** cross-lecture semantic + lexical retrieval across transcripts the signed-in learner is authorized to access, with links to the source lecture and passage; subject workspaces can scope questions to that subject's lectures
- Subject workspaces, invite-based classroom access, bookmarks, and lecture exports
- Learning-library dashboard with transcript coverage, concept-map totals, and recent activity

## System design

```mermaid
flowchart LR
  A[Audio recording or pasted notes] --> B[Transcript with timed segments]
  B --> C[Concepts, summary and learning map]
  B --> D[Passage chunking]
  D --> E[Gemini embeddings]
  E --> F[(PostgreSQL + pgvector)]
  D --> G[(PostgreSQL full-text index)]
  H[Question] --> I[Semantic + lexical retrieval]
  F --> I
  G --> I
  I --> J[Grounded Gemini response]
  J --> K[Validated source references]
  K --> L[Lecture and timestamp links]
```

The retrieval service embeds a question once, collects semantic and keyword candidates, then combines semantic similarity and lexical coverage with a 75/25 weighting. Each candidate retains the lecture ID, passage index, transcript timestamp, and speaker metadata. The answer model receives only the retrieved passages and must cite source IDs. The API validates those IDs against the retrieval result and returns citations from the database. Library-wide retrieval first builds the set of lectures the signed-in user can access through ownership, subject enrollment, or teaching role, then searches only those lecture IDs.

### Capstone research framing

**Research question:** How effectively can hybrid semantic and lexical retrieval find useful evidence across classroom transcripts while keeping each answer traceable to its source and access-controlled to the learner?

The implementation provides a testable system for that question. A defensible evaluation can compare keyword-only, vector-only, and hybrid retrieval on a manually labeled set of lecture questions. Report retrieval Recall@5 and mean reciprocal rank; assess generated answers with citation precision, citation coverage, and unsupported-claim rate; then measure task completion time and perceived usability with a small student study. Record the question set, retrieval configuration, model version, and rating rubric so results can be reproduced. No evaluation scores are claimed in this repository yet.

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn
- Neon PostgreSQL account & connection string
- Google AI Studio Gemini API Key

---

### 1. Backend Setup

```bash
cd server
npm install
```

Create a `.env` file inside `server/` (see `server/.env.example`):

```env
PORT=5000
DATABASE_URL="postgresql://user:password@ep-pooler.region.neon.tech/lecturemind?sslmode=require"
DIRECT_URL="postgresql://user:password@ep-direct.region.neon.tech/lecturemind?sslmode=require"
GEMINI_API_KEY="your_gemini_api_key_here"
CLIENT_URL="http://localhost:5173"
```

Generate Prisma Client:

```bash
npx prisma generate
```

To run database migrations (once database credentials are set):

```bash
npx prisma migrate dev --name init
```

Start the backend development server:

```bash
npm run dev
```

The backend health check will be available at:
`http://localhost:5000/api/health`

### Audio transcription and playback

Audio transcription uses the configured Gemini audio model. Uploaded recordings are kept on the backend so they can be played from the lecture page. Transcription speed and usage costs depend on your Gemini configuration and provider account.

By default, audio files are stored in `server/storage/audio` when the backend starts from `server/`. Set `AUDIO_STORAGE_DIR` to a persistent writable directory in deployments. The configured disk must persist across restarts; ephemeral serverless filesystems will not retain recordings.

---

### 2. Frontend Setup

```bash
cd ../client
npm install
```

Start the frontend development server:

```bash
npm run dev
```

The application will run at:
`http://localhost:5173`

---

## 📡 API Endpoints (Foundation)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status, uptime, and timestamp |

---

## 🗺️ Frontend Routes (Foundation)

| Route | Page / Purpose |
|---|---|
| `/` | Landing page & overview |
| `/login` | User login |
| `/register` | User registration |
| `/dashboard` | User dashboard & recent sessions |
| `/upload` | Lecture audio upload workflow |
| `/lectures` | Lectures library |
| `/lectures/:id` | Lecture learning map, transcript & summary viewer |
