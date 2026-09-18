/*
  Warnings:

  - You are about to drop the `Club` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ClubMember` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Club" DROP CONSTRAINT "Club_createdById_fkey";

-- DropForeignKey
ALTER TABLE "ClubMember" DROP CONSTRAINT "ClubMember_clubId_fkey";

-- DropForeignKey
ALTER TABLE "ClubMember" DROP CONSTRAINT "ClubMember_userId_fkey";

-- DropTable
DROP TABLE "Club";

-- DropTable
DROP TABLE "ClubMember";

-- DropEnum
DROP TYPE "ClubMemberRole";

-- DropEnum
DROP TYPE "ClubMemberStatus";

-- DropEnum
DROP TYPE "ClubStatus";
