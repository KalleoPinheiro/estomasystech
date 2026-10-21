import Image from 'next/image';

/** Duas primeiras iniciais do nome (clínica ou pessoa); vazio vira "?". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = [parts[0], parts.length > 1 ? parts[parts.length - 1] : '']
    .map((part) => part?.[0] ?? '')
    .join('');
  return (letters || '?').toUpperCase();
}

interface IdentityImageProps {
  /** Endereço da imagem; `null` mostra as iniciais. */
  url: string | null | undefined;
  /** Texto das iniciais (nome da clínica ou da pessoa). */
  name: string;
  /** Logo = quadrado com o nome da clínica no `alt`; avatar = círculo, `alt` vazio porque o nome está ao lado. */
  kind: 'logo' | 'avatar';
  size?: number;
}

/**
 * Logo da clínica ou avatar da equipe (#427). Sempre por `<img>` (nunca SVG
 * inline) e sem otimizador: o arquivo já vem recodificado ou sanitizado pela
 * API e o otimizador do Next recusa SVG.
 */
export function IdentityImage({
  url,
  name,
  kind,
  size = 36,
}: IdentityImageProps) {
  const shape = kind === 'avatar' ? 'rounded-full' : 'rounded-md';
  const alt = kind === 'logo' ? name : '';
  if (url) {
    return (
      <Image
        src={url}
        alt={alt}
        width={size}
        height={size}
        unoptimized
        className={`shrink-0 object-cover ${shape}`}
        style={{ width: size, height: size }}
      />
    );
  }
  const box = `inline-flex shrink-0 items-center justify-center bg-accent-soft font-semibold text-accent-ink ${shape}`;
  const style = { width: size, height: size, fontSize: size / 2.6 };
  if (kind === 'logo') {
    return (
      <span role="img" aria-label={name} className={box} style={style}>
        {initialsOf(name).slice(0, 2)}
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={box} style={style}>
      {initialsOf(name)}
    </span>
  );
}
