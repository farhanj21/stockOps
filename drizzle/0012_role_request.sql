ALTER TABLE "custom_roles" ADD COLUMN "can_request" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Existing custom roles that receive deliveries (warehouse-type) keep raising requests.
UPDATE "custom_roles" SET "can_request" = "can_receive";
