-- 1) Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SheetType') THEN
    CREATE TYPE "public"."SheetType" AS ENUM ('PLAN','DETAIL','NO_SCALE_NEEDED','UNKNOWN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ScaleStatus') THEN
    CREATE TYPE "public"."ScaleStatus" AS ENUM ('UNVERIFIED','VERIFIED','NO_SCALE_NEEDED');
  END IF;
END
$$;

-- 2) Table
CREATE TABLE IF NOT EXISTS "public"."Sheet" (
  "id" TEXT NOT NULL,
  "uploadId" TEXT NOT NULL,
  "pageNumber" INTEGER NOT NULL,
  "sheetType" "public"."SheetType" NOT NULL DEFAULT 'UNKNOWN',
  "scaleStatus" "public"."ScaleStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "scaleConfidence" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Sheet_pkey" PRIMARY KEY ("id")
);

-- 3) Constraints / indexes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Sheet_uploadId_pageNumber_key'
  ) THEN
    ALTER TABLE "public"."Sheet"
    ADD CONSTRAINT "Sheet_uploadId_pageNumber_key" UNIQUE ("uploadId", "pageNumber");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "Sheet_uploadId_idx" ON "public"."Sheet" ("uploadId");

-- 4) Foreign key to Upload
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Sheet_uploadId_fkey'
  ) THEN
    ALTER TABLE "public"."Sheet"
    ADD CONSTRAINT "Sheet_uploadId_fkey"
    FOREIGN KEY ("uploadId") REFERENCES "public"."Upload"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;