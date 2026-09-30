import { useCallback, useEffect, useRef, useState } from 'react';
import { MotionConfig, useReducedMotion } from 'motion/react';
import { useAuction } from '../lib/useAuction';
import { Wipe, WIPE_COVER_MS } from './bits';
import Join from './Join';
import Live from './Live';
import './phone.css';

const KEY = 'aah.agent';
const load = () => {
  // An agent that bought its seat through pay.sh gets a link with ?agent=; adopt it on this phone.
  const linked = new URLSearchParams(location.search).get('agent');
  if (linked && /^ag-[a-z0-9]{3,12}$/.test(linked)) {
    save(linked);
    history.replaceState(null, '', location.pathname);
    return linked;
  }
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const save = (id: string | null) => {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {}
};

export default function Phone() {
  const [agentId, setAgentId] = useState<string | null>(load);
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

  // Server reset: our agent is gone, so start over.
  useEffect(() => {
    if (agentId && fresh && fresh.agent === null) {
      save(null);
      setSpawned(false);
      setAgentId(null);
    }
  }, [agentId, fresh]);

  const onSpawned = useCallback(
    (id: string) => {
      const enter = () => {
        save(id);
        setSpawned(true);
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
        {agentId ? <Live key={agentId} agentId={agentId} state={state} me={fresh} online={online} rise={spawned} /> : <Join onSpawned={onSpawned} />}
        {wipe > 0 && <Wipe key={wipe} onDone={endWipe} />}
      </div>
    </MotionConfig>
  );
}
