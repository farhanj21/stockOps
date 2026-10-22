import Image from 'next/image';

const SIZES = {
  lg: { box: 44, radius: 12, font: 17 },
  md: { box: 36, radius: 10, font: 14 },
  sm: { box: 34, radius: 9, font: 14 },
} as const;

/** The StockOps mark, or the organization's uploaded logo when `src` is set. */
export function Logo({ size = 'md', src }: { size?: keyof typeof SIZES; src?: string | null }) {
  const s = SIZES[size];
  return (
    <div
      className={`logo${src ? ' has-img' : ''}`}
      style={{ width: s.box, height: s.box, borderRadius: s.radius, fontSize: s.font }}
      aria-hidden="true"
    >
      {src ? <Image src={src} alt="" width={s.box} height={s.box} unoptimized /> : 'SO'}
    </div>
  );
}
