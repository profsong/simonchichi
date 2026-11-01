import {
  defaultRoom,
  freeRoomItemIds,
  getRoomItem,
  roomSlot,
  type RoomSelection,
} from './room-catalog';
import type { PurchaseReceipt, RewardEvent } from './types';

/** Earnings remain append-only. Spending is a separate receipt ledger. */
export function availableXp(rewards: RewardEvent[], purchases: PurchaseReceipt[]): number {
  return (
    rewards.reduce((sum, reward) => sum + reward.xp, 0) -
    purchases.reduce((sum, purchase) => sum + purchase.price, 0)
  );
}

export function ownedRoomItemIds(purchases: PurchaseReceipt[]): Set<string> {
  return new Set([...freeRoomItemIds, ...purchases.map((purchase) => purchase.itemId)]);
}

export function resolveRoom(selection?: Partial<RoomSelection>): RoomSelection {
  const resolved = { ...defaultRoom };
  for (const slot of Object.keys(defaultRoom) as (keyof RoomSelection)[]) {
    const id = selection?.[slot];
    const item = id ? getRoomItem(id) : undefined;
    if (item && roomSlot(item.category) === slot) resolved[slot] = item.id;
  }
  return resolved;
}

export function roomSelectionIsOwned(
  selection: RoomSelection | undefined,
  purchases: PurchaseReceipt[],
): boolean {
  if (!selection) return true;
  const owned = ownedRoomItemIds(purchases);
  return (Object.keys(defaultRoom) as (keyof RoomSelection)[]).every((slot) => {
    const item = getRoomItem(selection[slot]);
    return !!item && roomSlot(item.category) === slot && owned.has(item.id);
  });
}
