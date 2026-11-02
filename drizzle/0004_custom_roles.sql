CREATE TABLE "custom_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"can_stock" boolean DEFAULT false NOT NULL,
	"can_receive" boolean DEFAULT false NOT NULL,
	"can_plan" boolean DEFAULT false NOT NULL,
	"can_setup" boolean DEFAULT false NOT NULL,
	"can_team" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_roles_org_name" UNIQUE("organization_id","name")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "custom_role_id" text;--> statement-breakpoint
ALTER TABLE "custom_roles" ADD CONSTRAINT "custom_roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_custom_role_id_custom_roles_id_fk" FOREIGN KEY ("custom_role_id") REFERENCES "public"."custom_roles"("id") ON DELETE set null ON UPDATE no action;