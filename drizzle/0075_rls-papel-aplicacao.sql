DO $$
BEGIN
  BEGIN
    CREATE ROLE estomasystech_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'RLS etapa 1: o papel que migra não pode criar papéis; crie estomasystech_app à mão (docs/engineering/producao.md, RLS etapa 1)';
  END;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'estomasystech_app') THEN
    GRANT USAGE ON SCHEMA public TO estomasystech_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO estomasystech_app;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO estomasystech_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO estomasystech_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO estomasystech_app;
  END IF;
END
$$;
