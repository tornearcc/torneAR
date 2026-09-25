import { describe, it, expect, vi } from 'vitest';

// constants/legal importa react-native (Linking) para abrir los documentos;
// acá sólo hacen falta las versiones.
vi.mock('@/constants/legal', () => ({
  LEGAL_VERSIONS: { terms: '11 de Septiembre, 2026', privacy: '24 de Agosto, 2026' },
}));

import { pendingLegalDocuments } from './legal-acceptance';

const CURRENT = {
  accepted_tyc: true,
  accepted_privacy: true,
  tyc_version: '11 de Septiembre, 2026',
  privacy_version: '24 de Agosto, 2026',
};

describe('pendingLegalDocuments', () => {
  it('con las dos versiones vigentes aceptadas no falta nada', () => {
    expect(pendingLegalDocuments(CURRENT)).toEqual([]);
  });

  it('una Política nueva pide sólo la Política', () => {
    expect(
      pendingLegalDocuments(CURRENT, { terms: '11 de Septiembre, 2026', privacy: '1 de Octubre, 2026' }),
    ).toEqual(['privacy']);
  });

  it('unos Términos nuevos piden sólo los Términos (comportamiento de hoy)', () => {
    expect(
      pendingLegalDocuments(CURRENT, { terms: '1 de Octubre, 2026', privacy: '24 de Agosto, 2026' }),
    ).toEqual(['terms']);
  });

  it('si cambian los dos, pide los dos', () => {
    expect(
      pendingLegalDocuments(CURRENT, { terms: '1 de Octubre, 2026', privacy: '1 de Octubre, 2026' }),
    ).toEqual(['terms', 'privacy']);
  });

  it('sin metadata (o sin aceptación estricta) faltan los dos', () => {
    expect(pendingLegalDocuments(null)).toEqual(['terms', 'privacy']);
    expect(pendingLegalDocuments({ ...CURRENT, accepted_privacy: 'true' })).toEqual(['privacy']);
    expect(pendingLegalDocuments({ ...CURRENT, accepted_tyc: 1 })).toEqual(['terms']);
  });
});
