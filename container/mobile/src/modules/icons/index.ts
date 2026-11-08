import { bundledIcons, fallbackIcon } from './generated';

export { bundledIcons, fallbackIcon } from './generated';
export type { IconColorMode, IconDefinition } from './types';

// Only concrete colors are valid in a standalone SVG image; CSS variables and
// currentColor belong to the page and cannot be resolved inside an image.
export function normalizeIconColor(color: string | undefined, fallback: string): string {
  const value = color?.trim();
  return value && /^(?:#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|[a-z]+)$/i.test(value)
    && !/^(?:currentColor|inherit|initial|unset)$/i.test(value) ? value : fallback;
}

export function resolveIcon(name: string, color?: string) {
  const known = Object.prototype.hasOwnProperty.call(bundledIcons, name);
  const icon = bundledIcons[known ? name : fallbackIcon];
  if (icon.kind === 'image') return { src: icon.src, label: icon.label, known };
  const fill = icon.colorMode === 'original' ? icon.defaultColor : normalizeIconColor(color, icon.defaultColor);
  const svg = icon.svg.replace(/currentColor/g, fill);
  return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, label: icon.label, known };
}

export function normalizeIconSize(size: number | string | undefined): number {
  const value = Number(size);
  return Number.isFinite(value) && value > 0 ? value : 24;
}
