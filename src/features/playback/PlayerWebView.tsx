import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { StreamPayload } from '@/src/data/catalog/types';
import {
  handleMediaFetchMessage,
  getMediaFetchInjectorOwner,
  registerMediaFetchInjector,
  useMediaFetchStore,
} from '@/src/features/downloads/mediaFetch';
import { t } from '@/src/shared/i18n';
import { colors } from '@/src/shared/theme';

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

export type PlayerProgressPayload = {
  currentTime: number;
  duration?: number;
};

type Props = {
  playerUrl: string;
  mode?: 'watch' | 'resolve';
  /** When true (resolve mode), keep iframe available for CDN segment downloads. */
  mediaFetch?: boolean;
  onStream?: (payload: StreamPayload) => void;
  onError?: (message: string) => void;
  onReady?: () => void;
  onStatus?: (message: string) => void;
  /** Best-effort playback progress from Android iframe hook. */
  onProgress?: (payload: PlayerProgressPayload) => void;
};

export function PlayerWebView({
  playerUrl,
  mode = 'watch',
  mediaFetch = false,
  onStream,
  onError,
  onReady,
  onStatus,
  onProgress,
}: Props) {
  const [loading, setLoading] = useState(true);
  const resolvedRef = useRef(false);
  const webRef = useRef<WebView>(null);
  const setReady = useMediaFetchStore((s) => s.setReady);
  const setPlayerUrl = useMediaFetchStore((s) => s.setPlayerUrl);

  // Player must run in a real iframe under newdeaf.top — top-level / rewritten HTML
  // produces an invalid Borth header and /bnsi returns 404.
  // On Android, NdStreamHookInterceptor injects the capture hook into the live iframe document.
  const html = useMemo(
    () => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    html, body { margin:0; padding:0; background:#000; width:100%; height:100%; overflow:hidden; }
    iframe { position:fixed; inset:0; width:100%; height:100%; border:0; background:#000; }
  </style>
</head>
<body>
  <iframe
    id="nd-player"
    src="${playerUrl.replace(/"/g, '&quot;')}"
    allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
    allowfullscreen
    referrerpolicy="origin"
  ></iframe>
</body>
</html>`,
    [playerUrl]
  );

  useEffect(() => {
    if (!mediaFetch || mode !== 'resolve') return;

    setPlayerUrl(playerUrl);
    registerMediaFetchInjector((id, url, modeName, range) => {
      const payload = JSON.stringify({
        type: 'nd_fetch',
        id,
        url,
        mode: modeName,
        range: range ?? null,
      });
      const js = `(function(){try{var f=document.getElementById('nd-player');if(f&&f.contentWindow){f.contentWindow.postMessage(${JSON.stringify(payload)},'*');}else{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'nd_fetch_result',id:${JSON.stringify(id)},error:'no iframe'}));}}catch(e){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'nd_fetch_result',id:${JSON.stringify(id)},error:String(e&&e.message||e)}));}})();true;`;
      webRef.current?.injectJavaScript(js);
    }, 'resolve');

    return () => {
      // Only clear if this resolve WebView still owns the injector — host may take over.
      registerMediaFetchInjector(null, 'resolve');
      if (getMediaFetchInjectorOwner() === null) {
        setReady(false);
      }
      // Don't clear playerUrl here — withMediaFetchPlayer owns teardown.
    };
  }, [mediaFetch, mode, playerUrl, setPlayerUrl, setReady]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data) as {
          type: string;
          data?: StreamPayload;
          message?: string;
          url?: string;
          keys?: string[];
          currentTime?: number;
          duration?: number | null;
          id?: string;
          status?: number;
          body?: string;
          encoding?: 'base64';
          error?: string;
          index?: number;
          count?: number;
        };
        if (handleMediaFetchMessage(msg)) return;
        if (msg.type === 'ready') {
          onReady?.();
          return;
        }
        if (msg.type === 'progress') {
          const currentTime = Number(msg.currentTime);
          if (Number.isFinite(currentTime) && currentTime > 0) {
            const duration =
              msg.duration != null && Number.isFinite(Number(msg.duration))
                ? Number(msg.duration)
                : undefined;
            onProgress?.({ currentTime, duration });
          }
          return;
        }
        if (msg.type === 'debug') {
          console.log('[PlayerWebView]', msg.message, msg.url ?? '', msg.keys ?? '');
          if (msg.message === 'hook_ready') {
            onStatus?.(t('player.resolving'));
          } else if (msg.message === 'bnsi_ok') {
            onStatus?.(t('player.resolved'));
          }
          return;
        }
        if (msg.type === 'error') {
          onError?.(msg.message ?? t('player.error'));
          return;
        }
        if (
          msg.type === 'stream' &&
          msg.data &&
          Array.isArray(msg.data.hlsSource) &&
          msg.data.hlsSource.length > 0
        ) {
          if (mediaFetch) setReady(true);
          if (!resolvedRef.current) {
            resolvedRef.current = true;
            onStream?.(msg.data);
          }
        }
      } catch {
        // ignore non-json
      }
    },
    [mediaFetch, onError, onProgress, onReady, onStatus, onStream, setReady]
  );

  if (mode === 'resolve') {
    return (
      <View style={styles.resolveWrap} pointerEvents="none" collapsable={false}>
        <WebView
          ref={webRef}
          source={{ html, baseUrl: 'https://newdeaf.top/' }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          mixedContentMode="always"
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          setSupportMultipleWindows={false}
          onMessage={onMessage}
          onLoadEnd={() => {
            setLoading(false);
            onStatus?.(t('player.resolving'));
          }}
          style={styles.resolveWeb}
          userAgent={USER_AGENT}
        />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <WebView
        ref={webRef}
        source={{ html, baseUrl: 'https://newdeaf.top/' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        mixedContentMode="always"
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        setSupportMultipleWindows={false}
        onMessage={onMessage}
        onLoadEnd={() => setLoading(false)}
        style={styles.web}
        userAgent={USER_AGENT}
      />
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.black,
  },
  web: {
    flex: 1,
    backgroundColor: colors.black,
  },
  loader: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.black,
  },
  resolveWrap: {
    height: 180,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.black,
  },
  resolveWeb: {
    flex: 1,
    backgroundColor: colors.black,
    opacity: 0.02,
  },
});
