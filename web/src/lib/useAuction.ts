import { useEffect, useState } from 'react';
import type { AuctionState, MeState } from '@shared/types';
import { startMock } from './mock';

// ?mock=1 runs a scripted auction in the browser so the UI works with no server.
export const isMock = new URLSearchParams(location.search).has('mock');

export function useAuction(agentId?: string | null) {
  const [state, setState] = useState<AuctionState | null>(null);
  const [me, setMe] = useState<MeState | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (isMock) return startMock(setState, setMe, agentId ?? undefined);
    const url = agentId ? `/api/stream?agent=${encodeURIComponent(agentId)}` : '/api/stream';
    const es = new EventSource(url);
    es.addEventListener('state', (e) => {
      try {
        setState(JSON.parse((e as MessageEvent).data));
        setOnline(true);
      } catch {}
    });
    es.addEventListener('me', (e) => {
      try {
        setMe(JSON.parse((e as MessageEvent).data));
      } catch {}
    });
    es.onerror = () => setOnline(false); // EventSource reconnects on its own
    return () => es.close();
  }, [agentId]);

  return { state, me, online };
}

export async function api<T = unknown>(path: string, body?: unknown): Promise<T | null> {
  if (isMock) return null;
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
