// STUB: the kit builder replaces the internals. Keep the export and props.
// The card for the item on sale: big pixel icon, name, rarity frame, what the winner gets, live price.
import type { Lot } from '@shared/types';
import { ItemSprite } from './sprites';

export function LotCard(props: { lot: Lot; price?: number; going?: boolean; forName?: string; size?: 'lg' | 'md' | 'sm'; className?: string }) {
  const { lot } = props;
  return (
    <div className={props.className}>
      <ItemSprite icon={lot.icon} size={props.size === 'lg' ? 160 : props.size === 'sm' ? 48 : 96} />
      <div>{lot.name}</div>
      <div>{lot.teaser}</div>
    </div>
  );
}
