import { ImageResponse } from 'next/og';
import { loadGoogleFont } from '@/lib/brand-image';

export const alt = 'StockOps — Production MRP & inventory control';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const NAVY = '#0F2038';
const GOLD = '#BFA05A';
const CREAM = '#F6F4EF';
const ON_NAVY = '#B9C2D0';

const HEADLINE = 'Every batch, every bag, accounted for.';
const TAGLINE = 'Production MRP & inventory control';
const FEATURES = ['Stock counts', 'Recipes', 'Forecasts', 'Purchase requests'];

/** The preview card shown when a link to the app is shared (WhatsApp, Slack, LinkedIn, X…). */
export default async function OpengraphImage() {
  const [serif, sans] = await Promise.all([
    loadGoogleFont('Marcellus', `SO StockOps ${HEADLINE}`),
    loadGoogleFont('Hanken Grotesk:wght@500', `${TAGLINE} ${FEATURES.join(' ')}`),
  ]);
  const fonts = [
    ...(serif ? [{ name: 'Marcellus', data: serif, style: 'normal' as const, weight: 400 as const }] : []),
    ...(sans ? [{ name: 'Hanken Grotesk', data: sans, style: 'normal' as const, weight: 500 as const }] : []),
  ];
  const serifFamily = serif ? 'Marcellus' : 'serif';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: NAVY,
          color: CREAM,
          fontFamily: sans ? 'Hanken Grotesk' : 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              width: 88,
              height: 88,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 22,
              border: `2px solid ${GOLD}`,
              color: GOLD,
              fontFamily: serifFamily,
              fontSize: 36,
              letterSpacing: 1,
            }}
          >
            SO
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 24 }}>
            <div style={{ fontFamily: serifFamily, fontSize: 44, lineHeight: 1.1 }}>StockOps</div>
            <div style={{ fontSize: 24, color: ON_NAVY, marginTop: 4 }}>{TAGLINE}</div>
          </div>
        </div>

        <div style={{ display: 'flex', maxWidth: 900, fontFamily: serifFamily, fontSize: 84, lineHeight: 1.12 }}>
          {HEADLINE}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ width: 96, height: 4, background: GOLD, marginBottom: 28 }} />
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 28, color: ON_NAVY }}>
            {FEATURES.map((feature, i) => (
              <div key={feature} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && <div style={{ width: 6, height: 6, borderRadius: 3, background: GOLD, margin: '0 20px' }} />}
                {feature}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
