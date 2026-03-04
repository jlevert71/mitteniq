/*
  Warnings:

  - The `intakeStatus` column on the `Upload` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "public"."IntakeStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "public"."Upload" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
DROP COLUMN "intakeStatus",
ADD COLUMN     "intakeStatus" "public"."IntakeStatus" NOT NULL DEFAULT 'PENDING';
