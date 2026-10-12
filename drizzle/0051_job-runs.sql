-- #212: última execução de cada job agendado (alerta "lembretes sem rodar há 26 h").
-- A linha dos lembretes nasce com a hora da migração: a contagem começa aqui.
CREATE TABLE "job_runs" (
	"job" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
INSERT INTO "job_runs" ("job", "last_run_at") VALUES ('reminders', now()) ON CONFLICT DO NOTHING;
