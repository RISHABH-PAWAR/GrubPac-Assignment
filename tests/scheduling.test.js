require('./setup');
const { pickActiveItem, minutesSinceMidnightUTC } = require('../src/services/scheduling.service');

const mkItems = (durations) =>
  durations.map((d, i) => ({
    id:             `content-${i}`,
    title:          `Content ${i}`,
    subject:        'maths',
    file_url:       `http://localhost/file-${i}.jpg`,
    file_type:      'jpg',
    rotation_order: i,
    duration:       d,
  }));

const atMinute = (minuteOfDay) => {
  const d = new Date();
  d.setUTCHours(0, minuteOfDay, 0, 0);
  return d;
};

describe('minutesSinceMidnightUTC', () => {
  it('returns 0 at midnight UTC', () => {
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    expect(minutesSinceMidnightUTC(midnight)).toBe(0);
  });

  it('returns 60 at 01:00 UTC', () => {
    const d = new Date();
    d.setUTCHours(1, 0, 0, 0);
    expect(minutesSinceMidnightUTC(d)).toBe(60);
  });

  it('returns 90 at 01:30 UTC', () => {
    const d = new Date();
    d.setUTCHours(1, 30, 0, 0);
    expect(minutesSinceMidnightUTC(d)).toBe(90);
  });
});

describe('pickActiveItem', () => {
  it('returns null for empty array', () => {
    expect(pickActiveItem([], new Date())).toBeNull();
  });

  it('returns null for null input', () => {
    expect(pickActiveItem(null, new Date())).toBeNull();
  });

  it('returns null when all durations are zero', () => {
    const items = mkItems([0, 0]);
    expect(pickActiveItem(items, new Date())).toBeNull();
  });

  it('always returns the sole item regardless of time', () => {
    const items = mkItems([10]);
    expect(pickActiveItem(items, atMinute(0)).id).toBe('content-0');
    expect(pickActiveItem(items, atMinute(55)).id).toBe('content-0');
  });

  describe('equal duration rotation — 3 items × 5 min (cycle=15)', () => {
    const items = mkItems([5, 5, 5]);

    it('minute 0  → item 0', () => expect(pickActiveItem(items, atMinute(0)).id).toBe('content-0'));
    it('minute 4  → item 0', () => expect(pickActiveItem(items, atMinute(4)).id).toBe('content-0'));
    it('minute 5  → item 1', () => expect(pickActiveItem(items, atMinute(5)).id).toBe('content-1'));
    it('minute 9  → item 1', () => expect(pickActiveItem(items, atMinute(9)).id).toBe('content-1'));
    it('minute 10 → item 2', () => expect(pickActiveItem(items, atMinute(10)).id).toBe('content-2'));
    it('minute 14 → item 2', () => expect(pickActiveItem(items, atMinute(14)).id).toBe('content-2'));
    it('minute 15 → item 0 (loop)', () => expect(pickActiveItem(items, atMinute(15)).id).toBe('content-0'));
    it('minute 17 → item 0 (loop)', () => expect(pickActiveItem(items, atMinute(17)).id).toBe('content-0'));
    it('minute 20 → item 1 (loop)', () => expect(pickActiveItem(items, atMinute(20)).id).toBe('content-1'));
  });

  describe('unequal durations — [10, 3, 7] min (cycle=20)', () => {
    const items = mkItems([10, 3, 7]);

    it('minute 0  → item 0', () => expect(pickActiveItem(items, atMinute(0)).id).toBe('content-0'));
    it('minute 9  → item 0', () => expect(pickActiveItem(items, atMinute(9)).id).toBe('content-0'));
    it('minute 10 → item 1', () => expect(pickActiveItem(items, atMinute(10)).id).toBe('content-1'));
    it('minute 12 → item 1', () => expect(pickActiveItem(items, atMinute(12)).id).toBe('content-1'));
    it('minute 13 → item 2', () => expect(pickActiveItem(items, atMinute(13)).id).toBe('content-2'));
    it('minute 19 → item 2', () => expect(pickActiveItem(items, atMinute(19)).id).toBe('content-2'));
    it('minute 20 → item 0 (loop)', () => expect(pickActiveItem(items, atMinute(20)).id).toBe('content-0'));
  });

  describe('single long duration — [60] min', () => {
    const items = mkItems([60]);
    it('always returns same item', () => {
      [0, 30, 59, 60, 1440].forEach((m) =>
        expect(pickActiveItem(items, atMinute(m % 1440)).id).toBe('content-0')
      );
    });
  });
});
