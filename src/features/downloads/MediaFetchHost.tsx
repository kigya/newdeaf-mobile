import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import {
  handleMediaFetchMessage,
  registerMediaFetchInjector,
  useMediaFetchStore,
} from '@/src/features/downloads/mediaFetch';

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

/**
 * Hidden player WebView used as Chrome network stack for CDN downloads.
 * vkvideo.cloud returns 403 to OkHttp on some device networks; iframe fetch works.
 *
 * Must load player inside an iframe under newdeaf.top — top-level player URL
 * breaks Borth/session (same constraint as PlayerWebView).
 */
export function MediaFetchHost() {
  const playerUrl = useMediaFetchStore((s) => s.playerUrl);
  const generation = useMediaFetchStore((s) => s.generation);
  const setReady = useMediaFetchStore((s) => s.setReady);
  const webRef = useRef<WebView>(null);

  useEffect(() => {
    if (!playerUrl) {
      registerMediaFetchInjector(null, 'host');
      setReady(false);
      return;
    }

    registerMediaFetchInjector((id, url, mode, range) => {
      // String payload — iframe hook JSON.parses message data.
      const payload = JSON.stringify({ type: 'nd_fetch', id, url, mode, range: range ?? null });
      const js = `(function(){try{var f=document.getElementById('nd-player');if(f&&f.contentWindow){f.contentWindow.postMessage(${JSON.stringify(payload)},'*');}else{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'nd_fetch_result',id:${JSON.stringify(id)},error:'no iframe'}));}}catch(e){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'nd_fetch_result',id:${JSON.stringify(id)},error:String(e&&e.message||e)}));}})();true;`;
      webRef.current?.injectJavaScript(js);
    }, 'host');

    return () => {
      registerMediaFetchInjector(null, 'host');
      setReady(false);
    };
  }, [playerUrl, generation, setReady]);

  const html = useMemo(() => {
    if (!playerUrl) return '';
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;background:#000">
  <iframe
    id="nd-player"
    src="${playerUrl.replace(/"/g, '&quot;')}"
    style="position:fixed;inset:0;width:100%;height:100%;border:0"
    allow="autoplay; encrypted-media"
    referrerpolicy="origin"
  ></iframe>
</body>
</html>`;
  }, [playerUrl]);

  if (!playerUrl) return null;

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        message?: string;
        url?: string;
        id?: string;
        status?: number;
        body?: string;
        encoding?: 'base64';
        error?: string;
        index?: number;
        count?: number;
      };
      if (handleMediaFetchMessage(msg)) return;
      // CDN signed URLs need the player bnsi/Borth session — hook_ready alone is too early.
      if (msg.type === 'stream') {
        setReady(true);
      }
    } catch {
      // ignore
    }
  };

  return (
    <View style={styles.host} pointerEvents="none" collapsable={false}>
      <WebView
        key={`host-${generation}-${playerUrl}`}
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
        style={styles.web}
        userAgent={USER_AGENT}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Match StreamResolver size — tiny 1×1 WebViews often never finish loading iframes.
  host: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 320,
    height: 180,
    opacity: 0.02,
    overflow: 'hidden',
    zIndex: -1,
  },
  web: {
    width: 320,
    height: 180,
    backgroundColor: '#000',
  },
});
