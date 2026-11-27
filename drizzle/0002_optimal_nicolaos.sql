CREATE TABLE "application_user_state" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" "account_status" DEFAULT 'UNVERIFIED' NOT NULL,
	"role" "account_role" DEFAULT 'MEMBER' NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"suspended_at" timestamp with time zone,
	"suspension_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_user_state" ADD CONSTRAINT "application_user_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_user_state" ADD CONSTRAINT "application_user_state_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_user_state_status_idx" ON "application_user_state" USING btree ("status");--> statement-breakpoint
CREATE INDEX "application_user_state_role_idx" ON "application_user_state" USING btree ("role");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");
INSERT INTO "application_user_state" (
  "user_id",
  "status",
  "role",
  "updated_at"
)
SELECT
  "id",
  CASE
    WHEN "email_verified" = true
      THEN 'PENDING_APPROVAL'::"account_status"
    ELSE 'UNVERIFIED'::"account_status"
  END,
  'MEMBER'::"account_role",
  now()
FROM "user"
ON CONFLICT ("user_id") DO NOTHING;
