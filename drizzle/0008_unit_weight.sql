ALTER TABLE "production_batches" ADD COLUMN "unit_weight_g" numeric(14, 3);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "unit_weight_g" numeric(14, 3);--> statement-breakpoint
UPDATE "products" SET "unit_weight_g" = round("batch_kg" * 1000 / "units_per_batch", 3) WHERE "units_per_batch" > 0;--> statement-breakpoint
UPDATE "production_batches" SET "unit_weight_g" = round("actual_kg" * 1000 / "units", 3) WHERE "units" > 0;
