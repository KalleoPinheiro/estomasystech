// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IdentityImage, initialsOf } from '@/components/identity-image';
import { IdentityImageField } from '@/components/identity-image-field';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const file = (name = 'logo.png', size = 10, type = 'image/png') => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

const pick = (input: HTMLElement, selected: File) =>
  fireEvent.change(input, { target: { files: [selected] } });

describe('Feature: Logo e avatar na interface (#427)', () => {
  describe('Cenário: iniciais como fallback', () => {
    it.each([
      ['Clínica Jeiciele Silva', 'CS'],
      ['ana', 'A'],
      ['  maria   souza  ', 'MS'],
      ['', '?'],
    ])(
      'Dado o nome %j, Quando tirar as iniciais, Então %s',
      (name, expected) => {
        expect(initialsOf(name)).toBe(expected);
      },
    );

    it('Dada clínica sem logo, Quando renderizar, Então mostra as iniciais com o nome da clínica como rótulo', () => {
      render(<IdentityImage kind="logo" url={null} name="Clínica Alfa Beta" />);

      expect(
        screen.getByRole('img', { name: 'Clínica Alfa Beta' }).textContent,
      ).toBe('CB');
    });

    it('Dada pessoa sem avatar, Quando renderizar, Então as iniciais ficam escondidas do leitor de tela (o nome está ao lado)', () => {
      const { container } = render(
        <IdentityImage kind="avatar" url={undefined} name="ana souza" />,
      );

      expect(screen.queryByRole('img')).toBeNull();
      expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe(
        'AS',
      );
    });
  });

  describe('Cenário: imagem enviada', () => {
    it('Dada a logo, Quando renderizar, Então o alt é o nome da clínica', () => {
      render(
        <IdentityImage
          kind="logo"
          url="/api/clinic/logo?v=a"
          name="Clínica Alfa"
        />,
      );

      expect(screen.getByAltText('Clínica Alfa').getAttribute('src')).toContain(
        '/api/clinic/logo',
      );
    });

    it('Dado o avatar, Quando renderizar, Então o alt é vazio e a forma é redonda', () => {
      const { container } = render(
        <IdentityImage
          kind="avatar"
          url="/api/account/avatar/1?v=a"
          name="Ana"
        />,
      );

      const img = container.querySelector('img') as HTMLImageElement;
      expect(img.getAttribute('alt')).toBe('');
      expect(img.className).toContain('rounded-full');
    });
  });

  describe('Cenário: campo de envio', () => {
    const mount = (
      props: Partial<Parameters<typeof IdentityImageField>[0]> = {},
    ) => {
      const onChanged = vi.fn();
      render(
        <IdentityImageField
          kind="logo"
          endpoint="/api/clinic/logo"
          name="Clínica Alfa"
          url={null}
          onChanged={onChanged}
          {...props}
        />,
      );
      return onChanged;
    };

    it('Dado um PNG válido, Quando escolher, Então envia por multipart e avisa o novo endereço', async () => {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          data: { logoUrl: '/api/clinic/logo?v=novo' },
        }),
      }));
      vi.stubGlobal('fetch', fetchMock);
      const onChanged = mount();

      pick(screen.getByLabelText('Enviar logo'), file());

      await waitFor(() =>
        expect(onChanged).toHaveBeenCalledWith('/api/clinic/logo?v=novo'),
      );
      const [url, init] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe('/api/clinic/logo');
      expect(init.method).toBe('POST');
      expect(init.body).toBeInstanceOf(FormData);
    });

    it('Dado avatar, Quando o servidor devolve avatarUrl, Então ele é repassado', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          json: async () => ({
            success: true,
            data: { avatarUrl: '/api/account/avatar/1?v=x' },
          }),
        })),
      );
      const onChanged = mount({
        kind: 'avatar',
        endpoint: '/api/account/avatar',
      });

      pick(screen.getByLabelText('Enviar foto'), file('eu.png'));

      await waitFor(() =>
        expect(onChanged).toHaveBeenCalledWith('/api/account/avatar/1?v=x'),
      );
    });

    it('Dado arquivo acima de 5 MB, Quando escolher, Então mostra o erro e não envia', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      mount();

      pick(
        screen.getByLabelText('Enviar logo'),
        file('grande.png', 5 * 1024 * 1024 + 1),
      );

      expect((await screen.findByRole('alert')).textContent).toContain(
        'Imagem excede o limite de 5 MB',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('Dado SVG malicioso, Quando o servidor recusa, Então o erro claro aparece no campo e nada muda', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: false,
          json: async () => ({
            error: 'SVG não aceito: elemento <script> não é permitido',
          }),
        })),
      );
      const onChanged = mount();

      pick(
        screen.getByLabelText('Enviar logo'),
        file('x.svg', 10, 'image/svg+xml'),
      );

      expect((await screen.findByRole('alert')).textContent).toContain(
        'SVG não aceito',
      );
      expect(onChanged).not.toHaveBeenCalled();
    });

    it('Dado servidor que responde sem corpo legível, Quando enviar, Então usa a mensagem padrão', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: false,
          json: async () => Promise.reject(new Error('x')),
        })),
      );
      mount();

      pick(screen.getByLabelText('Enviar logo'), file());

      expect((await screen.findByRole('alert')).textContent).toContain(
        'Erro ao enviar a logo',
      );
    });

    it('Dado erro que não é Error, Quando enviar, Então usa a mensagem padrão', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Promise.reject('rede')),
      );
      mount({ kind: 'avatar', endpoint: '/api/account/avatar' });

      pick(screen.getByLabelText('Enviar foto'), file());

      expect((await screen.findByRole('alert')).textContent).toContain(
        'Erro ao enviar a foto',
      );
    });

    it('Dada imagem atual, Quando confirmar a remoção, Então chama DELETE e avisa que ficou sem imagem', async () => {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: true }),
      }));
      vi.stubGlobal('fetch', fetchMock);
      const onChanged = mount({ url: '/api/clinic/logo?v=a' });

      fireEvent.click(screen.getByRole('button', { name: 'Remover logo' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Remover' }));

      await waitFor(() => expect(onChanged).toHaveBeenCalledWith(null));
      expect(
        (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].method,
      ).toBe('DELETE');
    });

    it('Dada falha ao remover, Quando confirmar, Então mostra o erro', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: false,
          json: async () => ({ error: 'Apenas Admin' }),
        })),
      );
      const onChanged = mount({ url: '/api/clinic/logo?v=a' });

      fireEvent.click(screen.getByRole('button', { name: 'Remover logo' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Remover' }));

      expect((await screen.findByRole('alert')).textContent).toContain(
        'Apenas Admin',
      );
      expect(onChanged).not.toHaveBeenCalled();
    });

    it('Dada falha de rede ao remover avatar, Quando confirmar, Então usa a mensagem padrão', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Promise.reject('rede')),
      );
      mount({ kind: 'avatar', endpoint: '/api/account/avatar', url: '/a?v=1' });

      fireEvent.click(screen.getByRole('button', { name: 'Remover foto' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Remover' }));

      expect((await screen.findByRole('alert')).textContent).toContain(
        'Erro ao remover a foto',
      );
    });

    it('Dado armazenamento indisponível, Quando renderizar, Então o campo fica desabilitado com aviso e sem botão de remover', () => {
      mount({
        url: '/api/clinic/logo?v=a',
        disabledReason: 'Envio indisponível neste ambiente',
      });

      expect(
        screen.getByText('Envio indisponível neste ambiente'),
      ).toBeTruthy();
      expect(
        (screen.getByLabelText('Enviar logo') as HTMLInputElement).disabled,
      ).toBe(true);
      expect(screen.queryByRole('button', { name: 'Remover logo' })).toBeNull();
    });

    it('Dado nenhum arquivo escolhido, Quando o seletor mudar, Então nada é enviado', () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      mount();

      fireEvent.change(screen.getByLabelText('Enviar logo'), {
        target: { files: [] },
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('Dado o seletor, Então aceita só formatos que o servidor aceita (sem HEIC)', () => {
      mount();

      const accept = (screen.getByLabelText('Enviar logo') as HTMLInputElement)
        .accept;
      expect(accept).toContain('image/svg+xml');
      expect(accept).not.toContain('heic');
    });
  });
});
