/** An expected failure whose message is safe to show the user. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: 'invalid' | 'forbidden' | 'not_found' | 'conflict' | 'signed_out' = 'invalid',
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === '23505' || err?.cause?.code === '23505';
};
