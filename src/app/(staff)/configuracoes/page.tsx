import { SettingsIndex } from './settings-index';

/**
 * Índice de Configurações (#522, #557): a página é Server Component e o índice
 * é uma ilha de cliente só porque filtra as seções pelo papel da identidade que
 * o layout da equipe já entrega no HTML; não há chamada de API na carga.
 */
export default function SettingsPage() {
  return <SettingsIndex />;
}
