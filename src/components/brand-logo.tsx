import { logo, logoClasses } from '@still-void/ui/react';
import Link from 'next/link';

interface BrandLogoProps {
  href?: string;
  label?: string;
  className?: string;
}

/**
 * Marca da clínica com a receita `logo()` do Still Void.
 *
 * Usa a receita em vez do componente `<Logo>` do pacote porque aquele renderiza
 * um `<a>` cru: como a marca aponta para uma rota interna, um `<a>` forçaria
 * navegação com recarga total. As receitas existem exatamente para aplicar o
 * estilo do design system a um elemento de outro framework.
 */
export function BrandLogo({
  href = '/',
  label = 'EstomaSysTech',
  className,
}: BrandLogoProps) {
  return (
    <Link href={href} className={className ? `${logo()} ${className}` : logo()}>
      <span className={logoClasses.dot} aria-hidden="true" />
      {label}
    </Link>
  );
}
