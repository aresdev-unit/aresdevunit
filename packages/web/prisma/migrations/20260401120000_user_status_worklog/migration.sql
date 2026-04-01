-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable: Add status column to users
ALTER TABLE "users" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'PENDING';

-- Backfill: Mark all existing users as APPROVED
UPDATE "users" SET "status" = 'APPROVED';

-- CreateTable: worklogs
CREATE TABLE "worklogs" (
    "id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "unfinished" TEXT,
    "metadata" JSONB,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT,

    CONSTRAINT "worklogs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "worklogs_user_id_date_key" ON "worklogs"("user_id", "date");

-- CreateIndex
CREATE INDEX "worklogs_user_id_date_idx" ON "worklogs"("user_id", "date" DESC);

-- AddForeignKey
ALTER TABLE "worklogs" ADD CONSTRAINT "worklogs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
