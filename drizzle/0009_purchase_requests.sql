ALTER TABLE "organizations" ADD COLUMN "last_request_no" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "po_lines" ADD COLUMN "received_qty" numeric(14, 3);--> statement-breakpoint
ALTER TABLE "po_lines" ADD COLUMN "received_on" date;--> statement-breakpoint
ALTER TABLE "po_lines" ADD COLUMN "received_by" text;--> statement-breakpoint
ALTER TABLE "po_lines" ADD COLUMN "receive_note" text;--> statement-breakpoint
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Orders already received: every line counts as received in full, on the order's date, by whoever received it.
UPDATE "po_lines" AS l SET "received_qty" = l."qty", "received_on" = o."received_on", "received_by" = o."received_by"
FROM "purchase_orders" AS o WHERE o."id" = l."po_id" AND o."status" = 'Received';--> statement-breakpoint
-- Open requests used to be added to pipeline; they now show in their own column, so take them back out of pipeline.
UPDATE "ingredients" AS i SET "pipeline" = greatest(0, i."pipeline" - s."qty")
FROM (
  SELECT l."ingredient_id", sum(l."qty") AS "qty"
  FROM "po_lines" AS l JOIN "purchase_orders" AS o ON o."id" = l."po_id"
  WHERE o."status" = 'Open'
  GROUP BY l."ingredient_id"
) AS s WHERE s."ingredient_id" = i."id";--> statement-breakpoint
-- Start each organization's request counter at the highest number used so far (deleted orders included).
UPDATE "organizations" AS org SET "last_request_no" = greatest(
  coalesce((SELECT max(nullif(regexp_replace(o."code", '[^0-9]', '', 'g'), '')::bigint) FROM "purchase_orders" AS o WHERE o."organization_id" = org."id"), 0),
  coalesce((SELECT max(nullif(regexp_replace(m."ref", '[^0-9]', '', 'g'), '')::bigint) FROM "stock_movements" AS m WHERE m."organization_id" = org."id" AND m."reason" = 'po_created'), 0)
);
