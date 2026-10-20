CREATE TYPE "public"."material_kind" AS ENUM('ingredient', 'packaging', 'utility');--> statement-breakpoint
CREATE TYPE "public"."movement_reason" AS ENUM('count', 'adjust', 'import', 'po_created', 'po_received', 'production_run');--> statement-breakpoint
CREATE TYPE "public"."po_status" AS ENUM('Open', 'Received');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('pending', 'approved', 'declined');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('Admin', 'Warehouse', 'Production');--> statement-breakpoint
CREATE TYPE "public"."stock_field" AS ENUM('in_hand', 'pipeline');--> statement-breakpoint
CREATE TABLE "access_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "role" NOT NULL,
	"password_hash" text NOT NULL,
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_forecasts" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"batches" integer NOT NULL,
	"target_date" date NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "forecast_batches_non_negative" CHECK ("production_forecasts"."batches" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT 'kg' NOT NULL,
	"kind" "material_kind" DEFAULT 'ingredient' NOT NULL,
	"cost" numeric(14, 2) DEFAULT 0 NOT NULL,
	"pack" numeric(14, 3) NOT NULL,
	"pack_name" text DEFAULT 'bag' NOT NULL,
	"par" numeric(14, 3) DEFAULT 0 NOT NULL,
	"in_hand" numeric(14, 3) DEFAULT 0 NOT NULL,
	"pipeline" numeric(14, 3) DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredients_name_unique" UNIQUE("name"),
	CONSTRAINT "ingredients_non_negative" CHECK ("ingredients"."cost" >= 0 and "ingredients"."par" >= 0 and "ingredients"."in_hand" >= 0 and "ingredients"."pipeline" >= 0),
	CONSTRAINT "ingredients_pack_positive" CHECK ("ingredients"."pack" > 0)
);
--> statement-breakpoint
CREATE TABLE "po_lines" (
	"po_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"packs" integer NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "po_lines_po_id_ingredient_id_pk" PRIMARY KEY("po_id","ingredient_id")
);
--> statement-breakpoint
CREATE TABLE "production_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"forecast_id" text,
	"product_id" text NOT NULL,
	"batches" integer NOT NULL,
	"run_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"batch_kg" numeric(14, 3) NOT NULL,
	"units_per_batch" integer NOT NULL,
	"units_per_case" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "products_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"status" "po_status" DEFAULT 'Open' NOT NULL,
	"placed_on" date NOT NULL,
	"received_on" date,
	"created_by" text,
	"received_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_lines" (
	"product_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"qty_per_batch" numeric(14, 3) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "recipe_lines_product_id_ingredient_id_pk" PRIMARY KEY("product_id","ingredient_id"),
	CONSTRAINT "recipe_qty_non_negative" CHECK ("recipe_lines"."qty_per_batch" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"view_role" "role",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"ingredient_id" text NOT NULL,
	"field" "stock_field" NOT NULL,
	"delta" numeric(14, 3) NOT NULL,
	"balance_after" numeric(14, 3) NOT NULL,
	"reason" "movement_reason" NOT NULL,
	"ref" text,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_forecasts" ADD CONSTRAINT "production_forecasts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_forecasts" ADD CONSTRAINT "production_forecasts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_forecast_id_production_forecasts_id_fk" FOREIGN KEY ("forecast_id") REFERENCES "public"."production_forecasts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_run_by_users_id_fk" FOREIGN KEY ("run_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stock_movements_ingredient_idx" ON "stock_movements" USING btree ("ingredient_id","created_at");