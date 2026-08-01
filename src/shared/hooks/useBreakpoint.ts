import { useWindowDimensions } from 'react-native';

export type Breakpoint = 'phone' | 'tablet' | 'desktop';

export function useBreakpoint() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const breakpoint: Breakpoint = width >= 1100 ? 'desktop' : width >= 768 ? 'tablet' : 'phone';
  const columns = breakpoint === 'desktop' ? 6 : breakpoint === 'tablet' ? 4 : width >= 400 ? 3 : 2;
  const isTablet = breakpoint !== 'phone';

  return { width, height, breakpoint, columns, isTablet, isLandscape };
}
