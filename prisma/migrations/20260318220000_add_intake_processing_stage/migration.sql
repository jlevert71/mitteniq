-- Add PROCESSING to IntakeStatus and coarse intake stage text field.
ALTER TYPE "public"."IntakeStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

ALTER TABLE "public"."Upload"
ADD COLUMN "intakeStage" TEXT;
