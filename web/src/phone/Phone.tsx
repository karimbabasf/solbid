import { useCallback, useEffect, useRef, useState } from 'react';
import { MotionConfig, useReducedMotion } from 'motion/react';
import { useAuction } from '../lib/useAuction';
import { Wipe, WIPE_COVER_MS } from './bits';
import Join from './Join';
import Live from './Live';
import './phone.css';

const KEY = 'aah.agent';
const SIGN = 'aah.key';
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {}
};
const load = () => {
  // An agent that bought its seat through pay.sh gets a link with ?agent=; adopt it on this phone.
  const linked = new URLSearchParams(location.search).get('agent');
  if (linked && /^ag-[a-z0-9]{3,12}$/.test(linked)) {
    // The stored key signs for the old agent only, so an adopted agent has none.
    if (read(KEY) !== linked) write(SIGN, null);
    write(KEY, linked);
    history.replaceState(null, '', location.pathname);
    return linked;
  }
  return read(KEY);
};

export default function Phone() {
  const [agentId, setAgentId] = useState<string | null>(load);
  const [agentKey, setAgentKey] = useState<string | null>(() => read(SIGN));
  const [wipe, setWipe] = useState(0);
  const [spawned, setSpawned] = useState(false);
  const reduce = useReducedMotion();
  const { state, me, online } = useAuction(agentId);

  // The hook keeps the last `me` across agent changes; ignore it until the new stream speaks.
  const stale = useRef(me);
  useEffect(() => {
    stale.current = me;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);
  const fresh = me && me !== stale.current ? me : null;

  const forget = useCallback(() => {
    write(KEY, null);
    write(SIGN, null);
    setSpawned(false);
    setAgentKey(null);
    setAgentId(null);
  }, []);

  // Server reset or removal: our agent is gone, so start over.
  useEffect(() => {
    if (agentId && fresh && fresh.agent === null) forget();
  }, [agentId, fresh, forget]);

  const onSpawned = useCallback(
    (id: string, key: string) => {
      const enter = () => {
        write(KEY, id);
        write(SIGN, key);
        setSpawned(true);
        setAgentKey(key);
        setAgentId(id);
      };
      if (reduce) return enter();
      setWipe((w) => w + 1);
      setTimeout(enter, WIPE_COVER_MS);
    },
    [reduce],
  );
  const endWipe = useCallback(() => setWipe(0), []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="ph">
        {agentId ? (
          <Live key={agentId} agentId={agentId} agentKey={agentKey} state={state} me={fresh} online={online} rise={spawned} onLeft={forget} />
        ) : (
          <Join onSpawned={onSpawned} enterUrl={state?.enterUrl} />
        )}
        {wipe > 0 && <Wipe key={wipe} onDone={endWipe} />}
      </div>
    </MotionConfig>
  );
}
