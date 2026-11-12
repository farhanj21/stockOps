import { ImageResponse } from 'next/og';

/**
 * The glyphs of `text` in a Google font (e.g. "Marcellus", "Hanken Grotesk:wght@500"), fetched once at build time.
 * Returns null offline, and the image falls back to the default font.
 */
export async function loadGoogleFont(family: string, text: string): Promise<ArrayBuffer | null> {
  'use cache';
  try {
    const query = `family=${family.replace(/ /g, '+')}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(`https://fonts.googleapis.com/css2?${query}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/**
 * The SO monogram on navy, as a PNG.
 * `inset` shrinks the glyph for maskable icons, whose outer 10% may be cropped.
 */
export async function brandImage(size: number, { rounded = false, inset = 1 } = {}) {
  const font = await loadGoogleFont('Marcellus', 'SO');
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0F2038',
          borderRadius: rounded ? size * 0.22 : 0,
          color: '#BFA05A',
          fontFamily: font ? 'Marcellus' : 'serif',
          fontSize: size * 0.4 * inset,
          letterSpacing: size * 0.01,
        }}
      >
        SO
      </div>
    ),
    {
      width: size,
      height: size,
      fonts: font ? [{ name: 'Marcellus', data: font, style: 'normal', weight: 400 }] : undefined,
    },
  );
}
