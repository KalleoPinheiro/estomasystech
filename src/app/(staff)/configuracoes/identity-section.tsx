'use client';

import { Button, Card, NativeSelect } from '@still-void/ui/react';
import { useEffect, useState } from 'react';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import {
  type ClinicTheme,
  type ClinicThemeAccent,
  type ClinicThemeMode,
  DEFAULT_CLINIC_THEME,
} from '@/domain/clinic/clinic-identity';
import type { SidebarIdentityDto } from '@/lib/dto';
import { useStaffAccess } from '@/lib/staff-access';
import { CLINIC_THEME_EVENT, resolveThemeMode } from '@/lib/theme';
import { useApiQuery } from '@/lib/use-api-query';
import { useSavableForm } from '@/lib/use-savable-form';

const MODE_LABELS: Record<ClinicThemeMode, string> = {
  system: 'Seguir o aparelho',
  light: 'Claro',
  dark: 'Escuro',
};

const ACCENT_LABELS: Record<ClinicThemeAccent, string> = {
  cyan: 'Ciano',
  violet: 'Violeta',
  mint: 'Menta',
  amber: 'Âmbar',
};

const DARK_QUERY = '(prefers-color-scheme: dark)';

function usePrefersDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DARK_QUERY);
    setDark(query.matches);
    const follow = () => setDark(query.matches);
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, []);
  return dark;
}

/**
 * Tema e cor da clínica (#426). O Admin de Empresa escolhe o modo padrão e a
 * cor; Atendente e Profissional veem a escolha sem editar. Cada aparelho ainda
 * pode alternar claro/escuro pelo botão do menu.
 */
export function IdentitySection() {
  const { data, error } = useApiQuery<SidebarIdentityDto>('/api/auth/identity');
  if (error) return <IdentityUnavailable />;
  if (!data) return <LoadingIndicator />;
  return <IdentityForm initial={data.clinicTheme ?? DEFAULT_CLINIC_THEME} />;
}

/**
 * Sem ler a escolha atual, a tela não oferece edição: salvar às cegas
 * regravaria o padrão por cima da cor da clínica. É aviso, não alerta: o tema
 * é cosmético e não deve competir com os erros das demais seções.
 */
function IdentityUnavailable() {
  return (
    <Card as="section" className="p-5">
      <h2 className="mb-1 font-semibold text-lg">Identidade visual</h2>
      <p className="text-ink-3 text-sm">
        Não foi possível ler a identidade visual agora. Recarregue a página.
      </p>
    </Card>
  );
}

function IdentityForm({ initial }: { initial: ClinicTheme }) {
  const canEdit = useStaffAccess()('/api/settings/clinic-identity');
  const prefersDark = usePrefersDark();
  const { draft, setDraft, saveError, save } = useSavableForm<ClinicTheme>({
    endpoint: '/api/settings/clinic-identity',
    initialValue: initial,
    successMessage: 'Identidade visual salva',
    errorFallback: 'Erro ao salvar a identidade visual',
    // O servidor relê o tema na próxima navegação; o evento troca o app já.
    onSaved: () =>
      window.dispatchEvent(
        new CustomEvent<ClinicTheme>(CLINIC_THEME_EVENT, { detail: draft }),
      ),
  });
  const previewMode = resolveThemeMode(draft.mode, prefersDark);

  return (
    <Card as="section" className="p-5">
      <h2 className="mb-1 font-semibold text-lg">Identidade visual</h2>
      <p className="mb-4 text-ink-3 text-sm">
        Cor e tema padrão do sistema para toda a equipe. Cada aparelho pode
        trocar entre claro e escuro pelo botão do menu; a cor é sempre a da
        clínica.
        {!canEdit && ' Só o Admin de Empresa altera.'}
      </p>
      {saveError && <ErrorAlert message={saveError} />}
      <div className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="font-medium text-sm">
          Tema padrão
          <NativeSelect
            value={draft.mode}
            disabled={!canEdit}
            onChange={(e) =>
              setDraft({ ...draft, mode: e.target.value as ClinicThemeMode })
            }
            className="mt-1"
          >
            {Object.entries(MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="font-medium text-sm">
          Cor
          <NativeSelect
            value={draft.accent}
            disabled={!canEdit}
            onChange={(e) =>
              setDraft({
                ...draft,
                accent: e.target.value as ClinicThemeAccent,
              })
            }
            className="mt-1"
          >
            {Object.entries(ACCENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>
      <div
        data-testid="identity-preview"
        data-theme={previewMode}
        data-accent={draft.accent}
        className="sv-body mt-4 flex max-w-xl flex-col gap-3 rounded-lg border border-border p-4"
      >
        <p className="font-medium text-sm">Prévia</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="accent" tabIndex={-1}>
            Botão principal
          </Button>
          <span className="font-medium text-sm [color:var(--sv-accent-ink)]">
            Link e destaque
          </span>
        </div>
      </div>
      {canEdit && (
        <Button
          type="button"
          onClick={() => void save()}
          variant="accent"
          className="mt-4"
        >
          Salvar identidade visual
        </Button>
      )}
    </Card>
  );
}
