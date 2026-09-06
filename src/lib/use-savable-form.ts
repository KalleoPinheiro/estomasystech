'use client';

import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { apiFetch } from './client';

export interface UseSavableFormOptions<T> {
  endpoint: string;
  initialValue: T;
  successMessage: string;
  errorFallback: string;
  onSaved?: () => void;
  validate?: (draft: T) => string | null;
}

export interface UseSavableFormResult<T> {
  draft: T;
  setDraft: (update: T | ((prev: T) => T)) => void;
  saveError: string | null;
  save: () => Promise<void>;
}

export function useSavableForm<T>({
  endpoint,
  initialValue,
  successMessage,
  errorFallback,
  onSaved,
  validate,
}: UseSavableFormOptions<T>): UseSavableFormResult<T> {
  const { toast } = useToast();
  const [edits, setEdits] = useState<T | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const draft = edits ?? initialValue;

  const setDraft = (update: T | ((prev: T) => T)) =>
    setEdits(
      typeof update === 'function' ? (update as (prev: T) => T)(draft) : update,
    );

  const save = async () => {
    if (validate) {
      const validationMessage = validate(draft);
      if (validationMessage) {
        setSaveError(validationMessage);
        return;
      }
    }
    setSaveError(null);
    try {
      await apiFetch(endpoint, { method: 'PUT', body: JSON.stringify(draft) });
      toast({ description: successMessage, variant: 'success' });
      onSaved?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : errorFallback;
      setSaveError(message);
      toast({ description: message, variant: 'danger' });
    }
  };

  return { draft, setDraft, saveError, save };
}
