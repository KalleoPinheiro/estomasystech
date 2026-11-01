import {
  cloneElement,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
  Suspense,
} from 'react';
import { renderWithToast } from './render-with-toast';

type AsyncComponent = (props: unknown) => Promise<ReactNode>;

const isAsyncComponent = (type: unknown): type is AsyncComponent =>
  typeof type === 'function' && type.constructor.name === 'AsyncFunction';

/**
 * Resolve os Server Components assíncronos de uma árvore, como o servidor faz
 * antes de mandar o HTML: o jsdom só renderiza componente síncrono. `Suspense`
 * some (o servidor já esperou o dado); componente síncrono, de cliente ou não,
 * fica intacto, mas seus filhos são resolvidos.
 */
export async function resolveServerTree(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) {
    return Promise.all(node.map((child) => resolveServerTree(child)));
  }
  if (!isValidElement(node)) {
    return node;
  }
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (isAsyncComponent(element.type)) {
    return resolveServerTree(await element.type(element.props));
  }
  if (element.type === Suspense || element.type === Fragment) {
    return <>{await resolveServerTree(element.props.children)}</>;
  }
  if (element.props.children === undefined) {
    return element;
  }
  return cloneElement(
    element,
    undefined,
    await resolveServerTree(element.props.children),
  );
}

/** Fallbacks dos `<Suspense>` da árvore: o que a pessoa vê enquanto cada bloco carrega. */
export function suspenseFallbacks(node: ReactNode): ReactNode[] {
  if (Array.isArray(node)) {
    return node.flatMap((child) => suspenseFallbacks(child));
  }
  if (!isValidElement(node)) {
    return [];
  }
  const element = node as ReactElement<{
    children?: ReactNode;
    fallback?: ReactNode;
  }>;
  const own = element.type === Suspense ? [element.props.fallback] : [];
  return [...own, ...suspenseFallbacks(element.props.children)];
}

/** Renderiza uma página de servidor (`await Page()`) já com os blocos resolvidos. */
export async function renderServerPage(page: () => Promise<ReactNode>) {
  return renderWithToast(
    (await resolveServerTree(await page())) as ReactElement,
  );
}
