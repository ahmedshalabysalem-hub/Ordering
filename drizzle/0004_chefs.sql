CREATE TABLE "chefs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "chef_id" uuid;--> statement-breakpoint
ALTER TABLE "chefs" ADD CONSTRAINT "chefs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chefs_branch_idx" ON "chefs" USING btree ("branch_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_chef_id_chefs_id_fk" FOREIGN KEY ("chef_id") REFERENCES "public"."chefs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_chef_idx" ON "orders" USING btree ("chef_id");