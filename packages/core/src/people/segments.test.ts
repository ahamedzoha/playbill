import { describe, expect, it } from 'vitest';
import { segmentOf } from './segments';

const DAY = 86_400_000;
const now = 1_800_000_000_000;
const base = { status: 'shared' as const, acceptedAt: now - 400 * DAY, invitedAt: now - 401 * DAY };

describe('segmentOf', () => {
  it.each([
    [0, 'active'],
    [29, 'active'],
    [30, 'cooling'],
    [89, 'cooling'],
    [90, 'dormant'],
    [179, 'dormant'],
    [180, 'inactive'],
    [900, 'inactive'],
  ])('%i days idle → %s', (days, seg) => {
    expect(segmentOf({ ...base, lastPlayedAt: now - days * DAY }, now)).toBe(seg);
  });

  it('never played and joined long ago → never', () => {
    expect(segmentOf({ ...base, lastPlayedAt: null }, now)).toBe('never');
  });

  it('joined recently → new, played or not', () => {
    const recent = { ...base, acceptedAt: now - 5 * DAY };
    expect(segmentOf({ ...recent, lastPlayedAt: null }, now)).toBe('new');
    expect(segmentOf({ ...recent, lastPlayedAt: now - DAY }, now)).toBe('new');
  });

  it('status wins over activity', () => {
    expect(segmentOf({ ...base, status: 'owner', lastPlayedAt: null }, now)).toBe('owner');
    expect(segmentOf({ ...base, status: 'removed', lastPlayedAt: now }, now)).toBe('removed');
    expect(segmentOf({ ...base, status: 'pending', lastPlayedAt: null }, now)).toBe('pending');
  });

  it('home users are segmented by activity like shared users', () => {
    expect(segmentOf({ ...base, status: 'home', lastPlayedAt: now - 100 * DAY }, now)).toBe('dormant');
  });
});
