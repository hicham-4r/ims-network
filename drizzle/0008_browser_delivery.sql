ALTER TABLE "messages" ADD COLUMN "delivered_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE "moderation_reviewers" (
 "user_id" text PRIMARY KEY CONSTRAINT "moderation_reviewers_user_id_user_id_fk" REFERENCES "user"("id") ON DELETE CASCADE,
 "granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_reports" (
 "id" text PRIMARY KEY,
 "reporter_id" text NOT NULL CONSTRAINT "message_reports_reporter_id_user_id_fk" REFERENCES "user"("id") ON DELETE CASCADE,
 "message_id" text NOT NULL CONSTRAINT "message_reports_message_id_messages_id_fk" REFERENCES "messages"("id") ON DELETE CASCADE,
 "category" text NOT NULL,
 "status" text DEFAULT 'OPEN' NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "reviewed_at" timestamp with time zone,
 CONSTRAINT "message_reports_category_chk" CHECK ("category" IN ('SPAM','HARASSMENT','OTHER')),
 CONSTRAINT "message_reports_status_chk" CHECK ("status" IN ('OPEN','DISMISSED','ESCALATED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "message_reports_reporter_message_uq" ON "message_reports" USING btree ("reporter_id","message_id");
--> statement-breakpoint
CREATE INDEX "message_reports_status_created_idx" ON "message_reports" USING btree ("status","created_at");
--> statement-breakpoint
CREATE INDEX "message_reports_reporter_created_idx" ON "message_reports" USING btree ("reporter_id","created_at");
