const {
  withAndroidManifest,
  AndroidConfig,
} = require('@expo/config-plugins');

/**
 * Registers react-native-background-actions foreground service with dataSync type
 * so MIUI/Android 14+ keep HLS downloads alive with an ongoing notification.
 */
function withDownloadForegroundService(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    const permissions = [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.WAKE_LOCK',
    ];

    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }
    for (const name of permissions) {
      const exists = manifest['uses-permission'].some(
        (p) => p.$?.['android:name'] === name
      );
      if (!exists) {
        manifest['uses-permission'].push({ $: { 'android:name': name } });
      }
    }

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    if (!app.service) app.service = [];

    const serviceName = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';
    const already = app.service.some((s) => s.$?.['android:name'] === serviceName);
    if (!already) {
      app.service.push({
        $: {
          'android:name': serviceName,
          'android:exported': 'false',
          'android:foregroundServiceType': 'dataSync',
          'android:stopWithTask': 'false',
        },
      });
    } else {
      const svc = app.service.find((s) => s.$?.['android:name'] === serviceName);
      if (svc?.$) {
        svc.$['android:foregroundServiceType'] = 'dataSync';
        svc.$['android:exported'] = 'false';
        svc.$['android:stopWithTask'] = 'false';
      }
    }

    return config;
  });
}

module.exports = withDownloadForegroundService;
