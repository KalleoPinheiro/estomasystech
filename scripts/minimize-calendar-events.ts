import { MinimizeCalendarEvents } from "@/application/appointments/minimize-calendar-events";
import { getRepositories } from "@/infrastructure/container";
import { clinicScope, systemScope } from "@/lib/auth/tenant-scope";
import { logError } from "@/lib/log-error";
import { publicAppUrl } from "@/lib/public-app-url";

/**
 * Reescrita em lote dos eventos antigos do Google Agenda (#339, AGE-RN-19):
 * troca nome, telefone e procedimento pelo conteúdo mínimo (iniciais, horário e
 * link). Nunca apaga evento. Idempotente: reexecutar só pega o que sobrou.
 *
 * Uso (execução manual; nunca roda sozinha no deploy):
 *   DATABASE_URL=... APP_URL=https://... npm run calendar:minimize -- [--confirmar] [--desde=AAAA-MM-DD] [--empresa=<id>]
 *
 * Sem --confirmar só conta os pendentes. Cada execução trata até 500 consultas
 * por empresa, das mais recentes para as mais antigas; repita até "0 pendentes".
 * Saída: 0 ok, 2 uso inválido, 1 se algum evento falhou ou a cota do Google
 * esgotou (rode de novo mais tarde).
 */
process.env.ESTOMASYSTECH_MIGRATE_ON_BOOT ??= "false";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<number> {
  const apply = process.argv.includes("--confirmar");
  const sinceRaw = arg("desde");
  const since = sinceRaw ? new Date(`${sinceRaw}T00:00:00-03:00`) : undefined;
  if (since && Number.isNaN(since.getTime())) {
    console.error("--desde deve ser AAAA-MM-DD");
    return 2;
  }
  const only = arg("empresa");
  const { clinics } = await getRepositories(systemScope());
  const targets = (await clinics.findAll()).filter((clinic) => !only || clinic.id === only);
  if (targets.length === 0) {
    console.error("Nenhuma empresa encontrada");
    return 2;
  }
  let incomplete = false;
  for (const clinic of targets) {
    try {
      const services = await getRepositories(clinicScope(clinic.id));
      const summary = await new MinimizeCalendarEvents(
        clinic.id,
        services.appointments,
        services.patients,
        services.calendar,
        services.auditEvents,
        publicAppUrl(),
      ).execute({ since, apply });
      if (summary.skipped) {
        console.log(`${clinic.id}\tsem integração com o Google Agenda`);
        continue;
      }
      console.log(
        `${clinic.id}\t${apply ? "reescritos" : "pendentes"}=${apply ? summary.rewritten : summary.pending}` +
          (apply ? `\tfalhas=${summary.failed}\tcota_esgotada=${summary.rateLimited}` : ""),
      );
      incomplete ||= summary.failed > 0 || summary.rateLimited;
    } catch (error) {
      console.error(`${clinic.id}\tfalha ao processar (ver log)`);
      logError(`Minimização do Google Agenda: empresa ${clinic.id}`, error);
      incomplete = true;
      continue;
    }
  }
  return incomplete ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
