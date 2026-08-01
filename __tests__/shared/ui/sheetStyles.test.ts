import { sheetStyles } from '@/src/shared/ui/sheetStyles';

describe('sheetStyles', () => {
  it('exposes shared sheet chrome keys', () => {
    expect(sheetStyles).toEqual(
      expect.objectContaining({
        root: expect.any(Object),
        backdrop: expect.any(Object),
        handle: expect.any(Object),
        header: expect.any(Object),
        chipActive: expect.any(Object),
        chipTextActive: expect.any(Object),
        cta: expect.any(Object),
        ctaDisabled: expect.any(Object),
        ctaText: expect.any(Object),
      })
    );
  });
});
