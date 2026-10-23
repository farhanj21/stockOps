CREATE TABLE "production_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"batch_no" text NOT NULL,
	"produced_on" date NOT NULL,
	"product_id" text NOT NULL,
	"forecast_id" text,
	"planned_kg" numeric(14, 3) NOT NULL,
	"actual_kg" numeric(14, 3) NOT NULL,
	"units" integer NOT NULL,
	"cases" integer NOT NULL,
	"material_cost" numeric(14, 2) NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_batches_org_no" UNIQUE("organization_id","batch_no"),
	CONSTRAINT "production_batches_amounts" CHECK ("production_batches"."actual_kg" > 0 and "production_batches"."units" >= 0 and "production_batches"."cases" >= 0 and "production_batches"."material_cost" >= 0)
);
--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_forecast_id_production_forecasts_id_fk" FOREIGN KEY ("forecast_id") REFERENCES "public"."production_forecasts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_batches_org_date_idx" ON "production_batches" USING btree ("organization_id","produced_on");