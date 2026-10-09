-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "banner_url" TEXT,
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "headline" TEXT,
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "photo_url" TEXT,
ADD COLUMN     "work_company" TEXT,
ADD COLUMN     "work_title" TEXT;
