import { errorMessage, toError } from '@/src/shared/lib/errorMessage';

describe('errorMessage', () => {
  it('returns Error.message', () => {
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('returns fallback for non-Error throws', () => {
    expect(errorMessage('string', 'fallback')).toBe('fallback');
    expect(errorMessage(null, 'fallback')).toBe('fallback');
    expect(errorMessage(42, 'fallback')).toBe('fallback');
    expect(errorMessage({ message: 'x' }, 'fallback')).toBe('fallback');
  });
});

describe('toError', () => {
  it('returns Error as-is and wraps other values', () => {
    const err = new Error('x');
    expect(toError(err)).toBe(err);
    expect(toError('y')).toEqual(new Error('y'));
    expect(toError(null).message).toBe('null');
  });
});
