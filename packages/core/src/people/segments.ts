const DAY = 86_400_000;

export const SEGMENTS = ['new', 'active', 'cooling', 'dormant', 'inactive', 'never', 'pending', 'removed', 'owner'] as const;
export type Segment = (typeof SEGMENTS)[number];

export const SEGMENT_BOUNDS = {
  /** Shared within this many days → "new" regardless of activity. */
  newDays: 30,
  activeDays: 30,
  coolingDays: 90,
  dormantDays: 180,
} as const;

export interface SegmentInput {
  status: 'owner' | 'shared' | 'pending' | 'home' | 'removed';
  lastPlayedAt: number | null;
  acceptedAt: number | null;
  invitedAt: number | null;
}

/**
 * Where someone is in their lifecycle, from how long ago they last played anything:
 * new (joined < 30 d) · active (< 30 d) · cooling (30–90 d) · dormant (90–180 d) · inactive (> 180 d) ·
 * never (never played, joined > 30 d ago) · pending (invite not accepted) · removed · owner.
 */
export function segmentOf(p: SegmentInput, now: number, bounds = SEGMENT_BOUNDS): Segment {
  if (p.status === 'owner') return 'owner';
  if (p.status === 'removed') return 'removed';
  if (p.status === 'pending') return 'pending';
  const joined = p.acceptedAt ?? p.invitedAt;
  if (joined !== null && now - joined < bounds.newDays * DAY) return 'new';
  if (p.lastPlayedAt === null) return 'never';
  const idle = now - p.lastPlayedAt;
  if (idle < bounds.activeDays * DAY) return 'active';
  if (idle < bounds.coolingDays * DAY) return 'cooling';
  if (idle < bounds.dormantDays * DAY) return 'dormant';
  return 'inactive';
}

/** Whole days since a timestamp, or null. */
export function daysSince(ts: number | null, now: number): number | null {
  return ts === null ? null : Math.floor((now - ts) / DAY);
}
