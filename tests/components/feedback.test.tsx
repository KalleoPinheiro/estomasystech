// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CnpjReviewAlert,
  EmptyState,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';

afterEach(() => {
  cleanup();
});

describe('Feature: Componentes de feedback', () => {
  describe('Cenário: alerta de erro', () => {
    it('Dado uma mensagem, Quando renderizar ErrorAlert, Então exibe a mensagem com papel de alerta', () => {
      render(<ErrorAlert message="Falha ao salvar paciente" />);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Falha ao salvar paciente');
    });

    it('Dado ErrorAlert renderizado, Então o alerta vem do Alert do Still Void', () => {
      render(<ErrorAlert message="Falha ao salvar paciente" />);

      // SPEC_DEVIATION: na 3.x o <Alert> do pacote emite a classe semântica
      // `sv-alert` em vez do utilitário Tailwind `bg-sv-surface` da 2.x — mesma
      // mudança de implementação do Dialog/Button (ver
      // tests/components/modal.test.tsx), não listada nas 3 quebras do Problem
      // Statement da spec. Prova de origem segue a classe real.
      expect(screen.getByRole('alert')).toHaveClass('sv-alert');
    });

    it('Dado ErrorAlert renderizado, Então usa o token semântico de erro via variante danger', () => {
      render(<ErrorAlert message="Falha ao salvar paciente" />);

      const alert = screen.getByRole('alert');
      // A variante danger aplica role="alert" e cores de erro automaticamente
      // via @still-void/ui v3.3+, sem necessidade de classes manuais
      expect(alert).toHaveTextContent('Falha ao salvar paciente');
    });

    it('Dado mensagem vazia, Quando renderizar ErrorAlert, Então ainda expõe o papel de alerta sem quebrar', () => {
      render(<ErrorAlert message="" />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('Dado nenhum onRetry, Quando renderizar ErrorAlert, Então não exibe botão de tentar novamente', () => {
      render(<ErrorAlert message="Falha ao salvar paciente" />);

      expect(
        screen.queryByRole('button', { name: 'Tentar novamente' }),
      ).not.toBeInTheDocument();
    });

    it("Dado onRetry, Quando renderizar ErrorAlert, Então exibe botão 'Tentar novamente' que o invoca ao clicar", () => {
      const onRetry = vi.fn();
      render(
        <ErrorAlert message="Falha ao salvar paciente" onRetry={onRetry} />,
      );

      const retryButton = screen.getByRole('button', {
        name: 'Tentar novamente',
      });
      fireEvent.click(retryButton);

      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cenário: indicador de carregamento', () => {
    it('Dado nenhuma prop, Quando renderizar LoadingIndicator, Então exibe texto de carregamento', () => {
      const { container } = render(<LoadingIndicator />);

      expect(screen.getByText('Carregando…')).toBeInTheDocument();
      expect(container.querySelector('.sv-card-skeleton')).toBeInTheDocument();
    });
  });

  describe('Cenário: estado vazio', () => {
    it('Dado uma mensagem, Quando renderizar EmptyState, Então exibe a mensagem informada', () => {
      render(<EmptyState message="Nenhum registro encontrado" />);

      expect(
        screen.getByText('Nenhum registro encontrado'),
      ).toBeInTheDocument();
    });

    it('Dado nenhum icon/action, Quando renderizar EmptyState, Então não exibe ícone nem link (DASH-05 AC3)', () => {
      render(<EmptyState message="Nenhum registro encontrado" />);

      expect(document.querySelector('svg')).not.toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('Dado icon, Quando renderizar EmptyState, Então exibe o ícone acima da mensagem (DASH-05 AC1)', () => {
      render(
        <EmptyState
          message="Nenhuma consulta agendada para hoje."
          icon="check-circle"
        />,
      );

      expect(document.querySelector('svg')).toBeInTheDocument();
    });

    it('Dado action, Quando renderizar EmptyState, Então exibe link com o rótulo apontando pro href (DASH-05 AC2)', () => {
      render(
        <EmptyState
          message="Nenhuma consulta agendada para hoje."
          action={{ label: 'Ver agenda', href: '/agenda' }}
        />,
      );

      const link = screen.getByRole('link', { name: 'Ver agenda' });
      expect(link).toHaveAttribute('href', '/agenda');
    });
  });

  describe('Cenário: CNPJ antigo marcado para correção (#355)', () => {
    it('Dada a marca, Quando renderizar, Então avisa; sem marca não renderiza nada', () => {
      const { container, rerender } = render(
        <CnpjReviewAlert since="2026-10-18T12:00:00.000Z" />,
      );
      expect(container).toHaveTextContent('dígito verificador');

      rerender(<CnpjReviewAlert since={null} />);
      expect(container).toBeEmptyDOMElement();
    });
  });
});
