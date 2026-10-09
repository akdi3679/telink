-- CreateTable
CREATE TABLE "security_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "question_key" TEXT NOT NULL,
    "question_text" TEXT,
    "answer_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_questions_user_id_idx" ON "security_questions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "security_questions_user_id_question_key_key" ON "security_questions"("user_id", "question_key");

-- AddForeignKey
ALTER TABLE "security_questions" ADD CONSTRAINT "security_questions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
