import { brandImage } from '@/lib/brand-image';

const ICONS = {
  '32': { size: 32, rounded: true, inset: 1 },
  '192': { size: 192, rounded: false, inset: 1 },
  '512': { size: 512, rounded: false, inset: 1 },
  // Android adaptive icon: keep the glyph inside the 80% safe zone.
  'maskable-512': { size: 512, rounded: false, inset: 0.75 },
} as const;

type IconId = keyof typeof ICONS;

export function generateImageMetadata() {
  return (Object.keys(ICONS) as IconId[]).map((id) => ({
    id,
    contentType: 'image/png',
    size: { width: ICONS[id].size, height: ICONS[id].size },
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const { size, rounded, inset } = ICONS[(await id) as IconId] ?? ICONS['192'];
  return brandImage(size, { rounded, inset });
}
