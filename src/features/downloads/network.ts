import * as Network from 'expo-network';

export type WifiGateState = {
  type?: string | null;
  isConnected?: boolean | null;
};

export function isWifiOnlyBlocked(state: WifiGateState, wifiOnly: boolean): boolean {
  if (!wifiOnly) return false;
  return state.type !== Network.NetworkStateType.WIFI;
}

export async function currentWifiOnlyBlocked(wifiOnly: boolean): Promise<boolean> {
  if (!wifiOnly) return false;
  try {
    const state = await Network.getNetworkStateAsync();
    return isWifiOnlyBlocked({ type: state.type, isConnected: state.isConnected }, wifiOnly);
  } catch {
    return wifiOnly;
  }
}
