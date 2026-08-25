import { useEffect } from 'react';

import {
  ensureMediaFetchPlayer,
  webViewFetchText,
} from '@/src/features/downloads/mediaFetch';
import {
  handleWebViewHtmlFetchMessage,
  registerWebViewHtmlFetcher,
} from '@/src/shared/lib/webviewHtmlFetch';

/**
 * Registers Chrome text fetch via MediaFetchHost (iframe under newdeaf.top +
 * NdStreamHook `__ndFetch`). `playerUrl` mounts the embed/player session;
 * `url` is the resource to XHR (playlist HTML, master.m3u8, …).
 */
export function EmbedHtmlFetchHost() {
  useEffect(() => {
    registerWebViewHtmlFetcher((id, url, _referer, playerUrl) => {
      void (async () => {
        try {
          await ensureMediaFetchPlayer(playerUrl || url);
          let lastError = 'WebView HTML fetch failed';
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const html = await webViewFetchText(url, 30000);
              if (html && html.length > 50) {
                handleWebViewHtmlFetchMessage(
                  JSON.stringify({ type: 'nd_html_fetch_result', id, html })
                );
                return;
              }
              lastError = `WebView HTML too short (${html?.length ?? 0})`;
            } catch (e) {
              lastError = e instanceof Error ? e.message : String(e);
              await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
            }
          }
          handleWebViewHtmlFetchMessage(
            JSON.stringify({ type: 'nd_html_fetch_result', id, error: lastError })
          );
        } catch (e) {
          handleWebViewHtmlFetchMessage(
            JSON.stringify({
              type: 'nd_html_fetch_result',
              id,
              error: e instanceof Error ? e.message : String(e),
            })
          );
        }
      })();
    });
    return () => registerWebViewHtmlFetcher(null);
  }, []);

  return null;
}
