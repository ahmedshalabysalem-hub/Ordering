DROP INDEX "orders_order_ref_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "orders_branch_order_ref_uq" ON "orders" USING btree ("branch_id","order_ref");