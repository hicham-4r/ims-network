CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"display_name_search" text NOT NULL,
	"program" text,
	"program_search" text,
	"department" text,
	"department_search" text,
	"graduation_year" integer,
	"bio" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profiles_display_name_search_idx" ON "profiles" USING btree ("display_name_search");--> statement-breakpoint
CREATE INDEX "profiles_program_search_idx" ON "profiles" USING btree ("program_search");--> statement-breakpoint
CREATE INDEX "profiles_department_search_idx" ON "profiles" USING btree ("department_search");--> statement-breakpoint
CREATE INDEX "profiles_graduation_year_idx" ON "profiles" USING btree ("graduation_year");
--> statement-breakpoint
INSERT INTO "profiles" (
  "user_id",
  "display_name",
  "display_name_search",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "name",
  lower(trim("name")),
  now(),
  now()
FROM "user"
ON CONFLICT ("user_id") DO NOTHING;
