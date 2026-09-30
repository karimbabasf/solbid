import { useEffect, useState } from 'react';
import type { AuctionState, MeState } from '@shared/types';
import { mockApi, startMock } from './mock';

// ?mock=1 runs a scripted auction in the browser so the UI works with no server.
export const isMock = new URLSearchParams(location.search).has('mock');

export function useAuction(agentId?: string | null) {
  const [state, setState] = useState<AuctionState | null>(null);
  const [me, setMe] = useState<MeState | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (isMock) return startMock(setState, setMe, agentId ?? undefined);
    const url = agentId ? `/api/stream?agent=${encodeURIComponent(agentId)}` : '/api/stream';
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    let lastEvent = 0;
    let sseDead = false;
    const opened = Date.now();
    // If the stream goes quiet (a proxy buffering it, a dead connection), poll a snapshot instead.
    // Cloudflare quick tunnels never deliver SSE, so a stream silent for 5s is closed for good there.
    let busy = false;
    const poll = setInterval(async () => {
      if (busy) return;
      if (!sseDead && lastEvent === 0 && Date.now() - opened > 5000) {
        sseDead = true;
        es?.close();
      }
      if (Date.now() - lastEvent < 3000) return;
      busy = true;
      try {
        const r = await fetch(agentId ? `/api/state?agent=${encodeURIComponent(agentId)}` : '/api/state', { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { state: AuctionState; me: MeState | null };
        if (closed || Date.now() - lastEvent < 3000) return;
        setState(j.state);
        if (j.me) setMe(j.me);
        setOnline(true);
      } catch {
        setOnline(false);
      } finally {
        busy = false;
      }
    }, 450); // the bidding war raises every ~0.6s, so polling clients (tunnels drop SSE) need to keep up
    const open = () => {
      es = new EventSource(url);
      es.addEventListener('state', (e) => {
        try {
          setState(JSON.parse((e as MessageEvent).data));
          setOnline(true);
          lastEvent = Date.now();
        } catch {}
      });
      es.addEventListener('me', (e) => {
        try {
          setMe(JSON.parse((e as MessageEvent).data));
          lastEvent = Date.now();
        } catch {}
      });
      es.onerror = () => {
        setOnline(false);
        // EventSource retries on its own unless the server answered with something that is not a stream
        // (a restart behind a proxy); then it is CLOSED for good and we reopen it.
        if (es?.readyState === EventSource.CLOSED && !closed && !sseDead) {
          clearTimeout(retry);
          retry = setTimeout(open, 1500);
        }
      };
    };
    open();
    return () => {
      closed = true;
      clearInterval(poll);
      clearTimeout(retry);
      es?.close();
    };
  }, [agentId]);

  return { state, me, online };
}

export async function api<T = unknown>(path: string, body?: unknown): Promise<T | null> {
  if (isMock) return (mockApi(path, body) as T) ?? null;
  try {
    const r = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}
