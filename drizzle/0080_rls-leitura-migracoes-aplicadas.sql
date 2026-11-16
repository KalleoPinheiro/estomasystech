-- RLS etapa 5 (preparo, #889, ADR-110): o papel da aplicação não enxerga o esquema `drizzle`, e é assim que deve ficar.
-- O readiness precisa saber só quais migrações já rodaram; esta função (SECURITY DEFINER, do dono) devolve apenas
-- os carimbos `created_at`, nada do hash nem do esquema. Aditiva: não muda tabela nem política.
-- search_path fixo e vazio de esquemas de usuário, para ninguém sequestrar a função por um objeto homônimo.
-- Rollback: DROP FUNCTION public.app__drizzle_migrations(); o readiness volta a ler `drizzle.__drizzle_migrations` só com o dono.
CREATE OR REPLACE FUNCTION public.app__drizzle_migrations() RETURNS SETOF bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT created_at FROM drizzle.__drizzle_migrations
$fn$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app__drizzle_migrations() FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'estomasystech_app') THEN
    GRANT EXECUTE ON FUNCTION public.app__drizzle_migrations() TO estomasystech_app;
  END IF;
END
$$;
