import {
  introWindowFromMarkers,
  isPlausibleIntroSkip,
  parseRemoveTimeSec,
  parseSkipTimeSec,
} from '@/src/data/catalog/streamMarkers';

describe('parseSkipTimeSec / parseRemoveTimeSec', () => {
  it('parses seconds, mm:ss, and hh:mm:ss', () => {
    expect(parseSkipTimeSec('90')).toBe(90);
    expect(parseSkipTimeSec('90.5')).toBe(90.5);
    expect(parseSkipTimeSec('  12  ')).toBe(12);
    expect(parseSkipTimeSec('1:30')).toBe(90);
    expect(parseSkipTimeSec('01:02')).toBe(62);
    expect(parseSkipTimeSec('1:02:03')).toBe(3723);
    expect(parseRemoveTimeSec('2:00')).toBe(120);
  });

  it('returns undefined for missing, empty, and garbage', () => {
    expect(parseSkipTimeSec(undefined)).toBeUndefined();
    expect(parseSkipTimeSec(null)).toBeUndefined();
    expect(parseSkipTimeSec('')).toBeUndefined();
    expect(parseSkipTimeSec('   ')).toBeUndefined();
    expect(parseSkipTimeSec('abc')).toBeUndefined();
    expect(parseSkipTimeSec('1:2:3:4')).toBeUndefined();
    expect(parseSkipTimeSec('1:-1')).toBeUndefined();
    expect(parseSkipTimeSec('-5')).toBeUndefined();
    expect(parseSkipTimeSec('NaN:00')).toBeUndefined();
  });
});

describe('isPlausibleIntroSkip', () => {
  it('accepts 10–600 inclusive and rejects bounds / junk', () => {
    expect(isPlausibleIntroSkip(9)).toBe(false);
    expect(isPlausibleIntroSkip(10)).toBe(true);
    expect(isPlausibleIntroSkip(600)).toBe(true);
    expect(isPlausibleIntroSkip(601)).toBe(false);
    expect(isPlausibleIntroSkip(undefined)).toBe(false);
    expect(isPlausibleIntroSkip(Number.NaN)).toBe(false);
  });
});

describe('introWindowFromMarkers', () => {
  it('builds a window from skip/remove clocks', () => {
    expect(introWindowFromMarkers('0:10', '1:00')).toEqual({ startSec: 10, endSec: 60 });
    expect(introWindowFromMarkers(undefined, '0:45')).toEqual({ startSec: 0, endSec: 45 });
    expect(introWindowFromMarkers('0:45')).toEqual({ startSec: 0, endSec: 45 });
  });

  it('returns undefined when the end is not a plausible intro', () => {
    expect(introWindowFromMarkers('0:05', '0:09')).toBeUndefined();
    expect(introWindowFromMarkers('garbage', 'nope')).toBeUndefined();
    expect(introWindowFromMarkers()).toBeUndefined();
  });

  it('falls back start to 0 when skip is missing, negative, or past the end', () => {
    expect(introWindowFromMarkers(null, '0:30')).toEqual({ startSec: 0, endSec: 30 });
    expect(introWindowFromMarkers('1:30', '0:30')).toEqual({ startSec: 0, endSec: 30 });
    expect(introWindowFromMarkers('-1', '0:30')).toEqual({ startSec: 0, endSec: 30 });
  });
});
