'use client';

import { useEffect, useRef, useState } from 'react';
import { useStaffIdentity } from './staff-access';

/**
 * Rascunho clínico que sobrevive à ida ao login quando a sessão expira no
 * salvamento (issue #207). Fica no `sessionStorage` (só esta aba, apagado ao
 * fechá-la), é gravado SÓ quando o salvamento falha por 401 e é consumido na
 * primeira leitura. Traz o e-mail da conta: outra pessoa que entre na mesma
 * aba não vê o texto.
 */
const PREFIX = 'estomasystech:draft:';

interface StoredDraft<T> {
  owner: string;
  values: T;
}

function takeDraft<T>(storageKey: string): StoredDraft<T> | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    window.sessionStorage.removeItem(storageKey);
    return raw ? (JSON.parse(raw) as StoredDraft<T>) : null;
  } catch {
    return null;
  }
}

function putDraft<T>(storageKey: string, draft: StoredDraft<T>): void {
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(draft));
  } catch {
    // Storage indisponível (modo privado, cota): perde-se o rascunho, como antes.
  }
}

/** Conta da sessão; `null` enquanto a identidade carrega ou fora da equipe. */
function useDraftOwner(): string | null {
  return useStaffIdentity()?.identity?.account?.email ?? null;
}

export interface SessionDraft<T> {
  /** Um rascunho desta conta foi restaurado neste formulário. */
  recovered: boolean;
  /** Guarda os valores (chame quando o salvamento falhar por sessão expirada). */
  stash: (values: T) => void;
  /** Esconde o aviso de rascunho recuperado (ex.: depois de salvar). */
  dismiss: () => void;
}

/**
 * `ready`: o formulário já mostra os dados definitivos. Restaurar antes (ex.:
 * anamnese ainda carregando, que remonta ao chegar) consumiria o rascunho num
 * formulário descartado.
 */
export function useSessionDraft<T>(
  key: string,
  onRestore: (values: T) => void,
  ready = true,
): SessionDraft<T> {
  const owner = useDraftOwner();
  const storageKey = `${PREFIX}${key}`;
  const [recovered, setRecovered] = useState(false);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  useEffect(() => {
    if (!owner || !ready) return;
    const draft = takeDraft<T>(storageKey);
    if (draft?.owner === owner) {
      onRestoreRef.current(draft.values);
      setRecovered(true);
    }
  }, [owner, ready, storageKey]);

  return {
    recovered,
    stash: (values: T) => {
      if (owner) putDraft(storageKey, { owner, values });
    },
    dismiss: () => setRecovered(false),
  };
}
