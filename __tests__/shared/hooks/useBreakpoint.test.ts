const mockUseWindowDimensions = jest.fn(() => ({ width: 360, height: 800 }));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockUseWindowDimensions(),
}));

import { renderHook } from '@testing-library/react-native';

import { useBreakpoint } from '@/src/shared/hooks/useBreakpoint';

describe('useBreakpoint', () => {
  beforeEach(() => {
    mockUseWindowDimensions.mockReset();
    mockUseWindowDimensions.mockReturnValue({ width: 360, height: 800 });
  });

  it('returns phone breakpoint and 2 columns for narrow width', async () => {
    mockUseWindowDimensions.mockReturnValue({ width: 360, height: 800 });
    const { result } = await renderHook(() => useBreakpoint());
    expect(result.current).toMatchObject({
      breakpoint: 'phone',
      columns: 2,
      isTablet: false,
      isLandscape: false,
    });
  });

  it('returns 3 columns for wider phones', async () => {
    mockUseWindowDimensions.mockReturnValue({ width: 420, height: 800 });
    const { result } = await renderHook(() => useBreakpoint());
    expect(result.current.columns).toBe(3);
  });

  it('returns tablet breakpoint', async () => {
    mockUseWindowDimensions.mockReturnValue({ width: 800, height: 600 });
    const { result } = await renderHook(() => useBreakpoint());
    expect(result.current).toMatchObject({
      breakpoint: 'tablet',
      columns: 4,
      isTablet: true,
      isLandscape: true,
    });
  });

  it('returns desktop breakpoint', async () => {
    mockUseWindowDimensions.mockReturnValue({ width: 1200, height: 800 });
    const { result } = await renderHook(() => useBreakpoint());
    expect(result.current).toMatchObject({
      breakpoint: 'desktop',
      columns: 6,
      isTablet: true,
    });
  });
});
