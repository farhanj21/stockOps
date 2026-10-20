const SIZES = {
  lg: { box: 44, radius: 12, font: 17 },
  md: { box: 36, radius: 10, font: 14 },
  sm: { box: 34, radius: 9, font: 14 },
} as const;

export function Logo({ size = 'md' }: { size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <div className="logo" style={{ width: s.box, height: s.box, borderRadius: s.radius, fontSize: s.font }} aria-hidden="true">
      SO
    </div>
  );
}
