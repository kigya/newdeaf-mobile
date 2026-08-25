import * as Network from 'expo-network';

import { currentWifiOnlyBlocked, isWifiOnlyBlocked } from '@/src/features/downloads/network';

const getState = Network.getNetworkStateAsync as jest.Mock;

describe('downloads network', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getState.mockReset();
    getState.mockResolvedValue({
      type: Network.NetworkStateType.WIFI,
      isConnected: true,
    });
  });

  it('isWifiOnlyBlocked is a no-op unless wifi-only is on', () => {
    expect(isWifiOnlyBlocked({ type: Network.NetworkStateType.CELLULAR }, false)).toBe(false);
    expect(isWifiOnlyBlocked({ type: Network.NetworkStateType.WIFI }, true)).toBe(false);
    expect(isWifiOnlyBlocked({ type: Network.NetworkStateType.CELLULAR }, true)).toBe(true);
  });

  it('currentWifiOnlyBlocked reads the OS state and fails closed', async () => {
    expect(await currentWifiOnlyBlocked(false)).toBe(false);
    expect(await currentWifiOnlyBlocked(true)).toBe(false);

    getState.mockResolvedValue({
      type: Network.NetworkStateType.CELLULAR,
      isConnected: true,
    });
    expect(await currentWifiOnlyBlocked(true)).toBe(true);

    getState.mockRejectedValue(new Error('net'));
    expect(await currentWifiOnlyBlocked(true)).toBe(true);
  });
});
