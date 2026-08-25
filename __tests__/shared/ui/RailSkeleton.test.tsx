import React from 'react';
import { render } from '@testing-library/react-native';

import { RailSkeleton } from '@/src/shared/ui/RailSkeleton';

describe('RailSkeleton', () => {
  it('renders the default and custom card counts', async () => {
    const def = await render(<RailSkeleton />);
    expect(def.toJSON()).toBeTruthy();
    def.unmount();
    const custom = await render(<RailSkeleton count={3} />);
    expect(custom.toJSON()).toBeTruthy();
  });
});
