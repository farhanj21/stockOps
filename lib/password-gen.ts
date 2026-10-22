/** A temporary password that is easy to read out or type on a phone, e.g. `kite-7342-rova`. */
export function generatePassword(): string {
  const consonants = 'bcdfghjkmnprstvz';
  const vowels = 'aeiou';
  const rnd = new Uint32Array(10);
  crypto.getRandomValues(rnd);
  const word = (o: number) => [0, 1, 2, 3].map((k) => (k % 2 ? vowels[rnd[o + k] % vowels.length] : consonants[rnd[o + k] % consonants.length])).join('');
  return `${word(0)}-${String(rnd[8] % 10000).padStart(4, '0')}-${word(4)}`;
}
