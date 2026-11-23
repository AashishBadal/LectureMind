-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lectures" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originalFileName" TEXT,
    "audioUrl" TEXT,
    "storagePath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lectures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" TEXT NOT NULL,
    "lectureId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "segments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "summaries" (
    "id" TEXT NOT NULL,
    "lectureId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concepts" (
    "id" TEXT NOT NULL,
    "lectureId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "importance" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "concepts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationships" (
    "id" TEXT NOT NULL,
    "lectureId" TEXT NOT NULL,
    "sourceConceptId" TEXT NOT NULL,
    "targetConceptId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_maps" (
    "id" TEXT NOT NULL,
    "lectureId" TEXT NOT NULL,
    "mapData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "id" TEXT NOT NULL,
    "lectureId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "timestamp" DOUBLE PRECISION,
    "transcriptPosition" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "lectures_userId_idx" ON "lectures"("userId");

-- CreateIndex
CREATE INDEX "lectures_createdAt_idx" ON "lectures"("createdAt");

-- CreateIndex
CREATE INDEX "lectures_status_idx" ON "lectures"("status");

-- CreateIndex
CREATE UNIQUE INDEX "transcripts_lectureId_key" ON "transcripts"("lectureId");

-- CreateIndex
CREATE INDEX "transcripts_lectureId_idx" ON "transcripts"("lectureId");

-- CreateIndex
CREATE UNIQUE INDEX "summaries_lectureId_key" ON "summaries"("lectureId");

-- CreateIndex
CREATE INDEX "summaries_lectureId_idx" ON "summaries"("lectureId");

-- CreateIndex
CREATE INDEX "concepts_lectureId_idx" ON "concepts"("lectureId");

-- CreateIndex
CREATE INDEX "relationships_lectureId_idx" ON "relationships"("lectureId");

-- CreateIndex
CREATE INDEX "relationships_sourceConceptId_idx" ON "relationships"("sourceConceptId");

-- CreateIndex
CREATE INDEX "relationships_targetConceptId_idx" ON "relationships"("targetConceptId");

-- CreateIndex
CREATE UNIQUE INDEX "learning_maps_lectureId_key" ON "learning_maps"("lectureId");

-- CreateIndex
CREATE INDEX "learning_maps_lectureId_idx" ON "learning_maps"("lectureId");

-- CreateIndex
CREATE INDEX "bookmarks_lectureId_idx" ON "bookmarks"("lectureId");

-- AddForeignKey
ALTER TABLE "lectures" ADD CONSTRAINT "lectures_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_sourceConceptId_fkey" FOREIGN KEY ("sourceConceptId") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_targetConceptId_fkey" FOREIGN KEY ("targetConceptId") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_maps" ADD CONSTRAINT "learning_maps_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
