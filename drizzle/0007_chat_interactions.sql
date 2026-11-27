ALTER TABLE "messages" ADD COLUMN "reply_to_message_id" text;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sender_reaction" text;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "peer_reaction" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "messages_id_conversation_unique" ON "messages" USING btree ("id","conversation_id");
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_conversation_fk" FOREIGN KEY ("reply_to_message_id","conversation_id") REFERENCES "public"."messages"("id","conversation_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_reaction_chk" CHECK ("messages"."sender_reaction" IS NULL OR "messages"."sender_reaction" IN ('like', 'love', 'laugh', 'wow', 'sad', 'fire'));
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_peer_reaction_chk" CHECK ("messages"."peer_reaction" IS NULL OR "messages"."peer_reaction" IN ('like', 'love', 'laugh', 'wow', 'sad', 'fire'));
