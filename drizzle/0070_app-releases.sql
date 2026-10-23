CREATE TABLE "app_releases" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"git_sha" text,
	"released_at" timestamp with time zone NOT NULL,
	"notes" text,
	CONSTRAINT "app_releases_version_unique" UNIQUE("version")
);
