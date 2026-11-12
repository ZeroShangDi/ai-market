export type IconColorMode = 'theme' | 'original';

interface IconBase {
  label: string;
  colorMode: IconColorMode;
  defaultColor: string;
}

export type IconDefinition = IconBase & (
  | { kind: 'svg'; svg: string }
  | { kind: 'image'; src: string }
);
