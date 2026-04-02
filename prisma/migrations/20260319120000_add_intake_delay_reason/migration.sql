-- Optional plain-English reason shown during intake processing
ALTER TABLE "public"."Upload"
ADD COLUMN "intakeDelayReason" TEXT;
