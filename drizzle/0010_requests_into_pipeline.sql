-- Purchase requests feed pipeline again: put every item still to arrive on an open request back into pipeline.
-- (0009 took open orders out of pipeline; on a fresh database the two cancel out.)
UPDATE "ingredients" AS i SET "pipeline" = i."pipeline" + s."qty"
FROM (
  SELECT l."ingredient_id", sum(l."qty") AS "qty"
  FROM "po_lines" AS l JOIN "purchase_orders" AS o ON o."id" = l."po_id"
  WHERE o."status" = 'Open' AND l."received_qty" IS NULL
  GROUP BY l."ingredient_id"
) AS s WHERE s."ingredient_id" = i."id";
