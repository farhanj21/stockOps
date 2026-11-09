ALTER TABLE "production_batches" ADD COLUMN "planned_units" integer;--> statement-breakpoint
ALTER TABLE "production_batches" ADD COLUMN "units_per_case" integer;--> statement-breakpoint
UPDATE "production_batches" AS b SET "planned_units" = p."units_per_batch", "units_per_case" = p."units_per_case" FROM "products" AS p WHERE p."id" = b."product_id";
