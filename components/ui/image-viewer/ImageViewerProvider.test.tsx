import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { ImageViewerProvider } from './ImageViewerProvider';
import { ExpandablePhoto } from './ExpandablePhoto';
import { useTeamStore } from '@/stores/teamStore';

/**
 * Flujos del visor de fotos: quién puede ver la foto ampliada, qué acción se
 * ofrece y que la denuncia (o el selector de fotos) se abra recién cuando el
 * visor terminó de cerrarse.
 *
 * `ZoomableImage` se reemplaza por un stub: los gestos (Reanimated + RNGH)
 * son del dispositivo y su matemática está en lib/image-viewer.test.ts. En
 * react-native-web `Platform.OS` es 'web', así que acá el "después de cerrar"
 * es el camino de Android (sin onDismiss).
 */

const mocks = vi.hoisted(() => ({
  isBlockedWith: vi.fn(),
  profileId: 'yo',
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/blocks-data', () => ({ isBlockedWith: mocks.isBlockedWith }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: mocks.profileId } }),
}));

vi.mock('./ZoomableImage', async () => {
  const { Text } = await import('react-native');
  return { ZoomableImage: ({ uri }: { uri: string }) => <Text>{`zoom ${uri}`}</Text> };
});

vi.mock('@/components/reports/ReportModal', async () => {
  const { Text } = await import('react-native');
  return {
    ReportModal: ({ entityType, entityId }: { entityType: string; entityId: string }) => (
      <Text>{`denuncia ${entityType} ${entityId}`}</Text>
    ),
  };
});

vi.mock('react-native-gesture-handler', async () => {
  const { View } = await import('react-native');
  return { GestureHandlerRootView: View };
});

function renderPhoto(node: React.ReactNode) {
  return render(<ImageViewerProvider>{node}</ImageViewerProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.profileId = 'yo';
  useTeamStore.setState({ myTeams: [] });
});

describe('ExpandablePhoto', () => {
  it('sin foto no es tocable: el toque sigue de largo a la fila', () => {
    renderPhoto(
      <ExpandablePhoto uri={null} subject={{ kind: 'avatar', profileId: 'otro' }}>
        <span>placeholder</span>
      </ExpandablePhoto>,
    );

    expect(screen.getByText('placeholder')).toBeTruthy();
    expect(screen.queryByLabelText(/Ver foto/)).toBeNull();
  });

  it('fuera del provider muestra la foto sin abrir nada', () => {
    render(
      <ExpandablePhoto uri="https://x/a.jpg" subject={{ kind: 'avatar', profileId: 'otro' }}>
        <span>foto</span>
      </ExpandablePhoto>,
    );

    expect(screen.queryByLabelText(/Ver foto/)).toBeNull();
  });
});

describe('foto de otro jugador', () => {
  const photo = (
    <ExpandablePhoto uri="https://x/otro.jpg" subject={{ kind: 'avatar', profileId: 'otro' }} title="Juan">
      <span>foto</span>
    </ExpandablePhoto>
  );

  it('consulta el bloqueo y, sin bloqueo, muestra la foto con "Denunciar"', async () => {
    mocks.isBlockedWith.mockResolvedValue(false);
    renderPhoto(photo);

    fireEvent.click(screen.getByLabelText('Ver foto de Juan'));

    expect(await screen.findByText('zoom https://x/otro.jpg')).toBeTruthy();
    expect(mocks.isBlockedWith).toHaveBeenCalledWith('otro');
    expect(screen.getByText('Denunciar')).toBeTruthy();
  });

  it('con un bloqueo entre los dos no muestra la foto ni ofrece acciones', async () => {
    mocks.isBlockedWith.mockResolvedValue(true);
    renderPhoto(photo);

    fireEvent.click(screen.getByLabelText('Ver foto de Juan'));

    expect(await screen.findByText('Foto no disponible')).toBeTruthy();
    expect(screen.queryByText('zoom https://x/otro.jpg')).toBeNull();
    expect(screen.queryByText('Denunciar')).toBeNull();
  });

  it('si la consulta falla, la muestra igual (la miniatura ya está a la vista)', async () => {
    mocks.isBlockedWith.mockRejectedValue(new Error('sin red'));
    renderPhoto(photo);

    fireEvent.click(screen.getByLabelText('Ver foto de Juan'));

    expect(await screen.findByText('zoom https://x/otro.jpg')).toBeTruthy();
  });

  it('"Denunciar" cierra el visor y recién después abre la denuncia del perfil', async () => {
    mocks.isBlockedWith.mockResolvedValue(false);
    renderPhoto(photo);

    fireEvent.click(screen.getByLabelText('Ver foto de Juan'));
    fireEvent.click(await screen.findByText('Denunciar'));

    expect(await screen.findByText('denuncia USER otro')).toBeTruthy();
    expect(screen.queryByText('zoom https://x/otro.jpg')).toBeNull();
  });
});

describe('foto propia', () => {
  it('no consulta bloqueos y ofrece "Cambiar foto", que corre después de cerrar', async () => {
    const onChangePhoto = vi.fn();
    renderPhoto(
      <ExpandablePhoto
        uri="https://x/yo.jpg"
        subject={{ kind: 'avatar', profileId: 'yo' }}
        title="Yo"
        onChangePhoto={onChangePhoto}
      >
        <span>foto</span>
      </ExpandablePhoto>,
    );

    fireEvent.click(screen.getByLabelText('Ver foto de Yo'));
    expect(screen.getByText('zoom https://x/yo.jpg')).toBeTruthy();
    expect(mocks.isBlockedWith).not.toHaveBeenCalled();
    expect(screen.queryByText('Denunciar')).toBeNull();

    fireEvent.click(screen.getByText('Cambiar foto'));
    expect(onChangePhoto).not.toHaveBeenCalled();
    await waitFor(() => expect(onChangePhoto).toHaveBeenCalledTimes(1));
  });
});

describe('escudos', () => {
  const shield = (teamId: string) => (
    <ExpandablePhoto uri={`https://x/${teamId}.png`} subject={{ kind: 'shield', teamId }} title="Los Pibes">
      <span>escudo</span>
    </ExpandablePhoto>
  );

  it('el de otro equipo se denuncia como TEAM, sin chequeo de bloqueo', async () => {
    renderPhoto(shield('rival'));

    fireEvent.click(screen.getByLabelText('Ver foto de Los Pibes'));
    expect(mocks.isBlockedWith).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Denunciar'));

    expect(await screen.findByText('denuncia TEAM rival')).toBeTruthy();
  });

  it('quien puede editar el equipo ve "Cambiar escudo", que corre después de cerrar', async () => {
    const onChangePhoto = vi.fn();
    useTeamStore.setState({ myTeams: [{ id: 'mio' }] as never });
    renderPhoto(
      <ExpandablePhoto
        uri="https://x/mio.png"
        subject={{ kind: 'shield', teamId: 'mio' }}
        title="Los Pibes"
        onChangePhoto={onChangePhoto}
      >
        <span>escudo</span>
      </ExpandablePhoto>,
    );

    fireEvent.click(screen.getByLabelText('Ver foto de Los Pibes'));
    fireEvent.click(screen.getByText('Cambiar escudo'));

    await waitFor(() => expect(onChangePhoto).toHaveBeenCalledTimes(1));
  });

  it('la foto propia sin onChangePhoto no ofrece ninguna acción', () => {
    renderPhoto(
      <ExpandablePhoto uri="https://x/yo.jpg" subject={{ kind: 'avatar', profileId: 'yo' }} title="Yo">
        <span>foto</span>
      </ExpandablePhoto>,
    );

    fireEvent.click(screen.getByLabelText('Ver foto de Yo'));

    expect(screen.queryByText('Denunciar')).toBeNull();
    expect(screen.queryByText('Cambiar foto')).toBeNull();
  });

  it('el de un equipo propio no ofrece denunciarlo', () => {
    useTeamStore.setState({ myTeams: [{ id: 'mio' }] as never });
    renderPhoto(shield('mio'));

    fireEvent.click(screen.getByLabelText('Ver foto de Los Pibes'));

    expect(screen.getByText('zoom https://x/mio.png')).toBeTruthy();
    expect(screen.queryByText('Denunciar')).toBeNull();
  });
});
