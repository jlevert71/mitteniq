-- AlterTable
ALTER TABLE "public"."Upload" ADD COLUMN     "intakeError" TEXT,
ADD COLUMN     "intakeReport" JSONB,
ADD COLUMN     "intakeStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "isRasterOnly" BOOLEAN,
ADD COLUMN     "isSearchable" BOOLEAN,
ADD COLUMN     "pageCount" INTEGER;
