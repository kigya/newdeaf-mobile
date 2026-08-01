/** Decode windows-1251 bytes to a JS string without Node polyfills. */
const WIN1251_MAP: number[] = (() => {
  const map = new Array<number>(256);
  for (let i = 0; i < 256; i++) map[i] = i;

  // Cyrillic block mapping for windows-1251 (0x80-0xFF)
  const specials: Record<number, number> = {
    0x80: 0x0402,
    0x81: 0x0403,
    0x82: 0x201a,
    0x83: 0x0453,
    0x84: 0x201e,
    0x85: 0x2026,
    0x86: 0x2020,
    0x87: 0x2021,
    0x88: 0x20ac,
    0x89: 0x2030,
    0x8a: 0x0409,
    0x8b: 0x2039,
    0x8c: 0x040a,
    0x8d: 0x040c,
    0x8e: 0x040b,
    0x8f: 0x040f,
    0x90: 0x0452,
    0x91: 0x2018,
    0x92: 0x2019,
    0x93: 0x201c,
    0x94: 0x201d,
    0x95: 0x2022,
    0x96: 0x2013,
    0x97: 0x2014,
    0x99: 0x2122,
    0x9a: 0x0459,
    0x9b: 0x203a,
    0x9c: 0x045a,
    0x9d: 0x045c,
    0x9e: 0x045b,
    0x9f: 0x045f,
    0xa0: 0x00a0,
    0xa1: 0x040e,
    0xa2: 0x045e,
    0xa3: 0x0408,
    0xa4: 0x00a4,
    0xa5: 0x0490,
    0xa6: 0x00a6,
    0xa7: 0x00a7,
    0xa8: 0x0401,
    0xa9: 0x00a9,
    0xaa: 0x0404,
    0xab: 0x00ab,
    0xac: 0x00ac,
    0xad: 0x00ad,
    0xae: 0x00ae,
    0xaf: 0x0407,
    0xb0: 0x00b0,
    0xb1: 0x00b1,
    0xb2: 0x0406,
    0xb3: 0x0456,
    0xb4: 0x0491,
    0xb5: 0x00b5,
    0xb6: 0x00b6,
    0xb7: 0x00b7,
    0xb8: 0x0451,
    0xb9: 0x2116,
    0xba: 0x0454,
    0xbb: 0x00bb,
    0xbc: 0x0458,
    0xbd: 0x0405,
    0xbe: 0x0455,
    0xbf: 0x0457,
  };

  for (const [k, v] of Object.entries(specials)) {
    map[Number(k)] = v;
  }

  // А-Яа-я contiguous block 0xC0-0xFF → U+0410-U+044F
  for (let i = 0xc0; i <= 0xff; i++) {
    map[i] = 0x0410 + (i - 0xc0);
  }

  return map;
})();

export function decodeWin1251(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += String.fromCharCode(WIN1251_MAP[bytes[i]]);
  }
  return out;
}

/** Reverse map: Unicode code point → windows-1251 byte (best-effort). */
const UNICODE_TO_WIN1251: Map<number, number> = (() => {
  const map = new Map<number, number>();
  for (let b = 0; b < 256; b++) {
    map.set(WIN1251_MAP[b], b);
  }
  return map;
})();

export function encodeWin1251(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // Reverse map always contains ASCII 0–127; unknown code points → '?'.
    out[i] = UNICODE_TO_WIN1251.get(code) ?? 0x3f;
  }
  return out;
}

/** Percent-encode windows-1251 bytes for application/x-www-form-urlencoded. */
export function encodeWin1251FormValue(str: string): string {
  const bytes = encodeWin1251(str);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    // Keep unreserved form bytes as-is; encode the rest
    if (
      (b >= 0x30 && b <= 0x39) || // 0-9
      (b >= 0x41 && b <= 0x5a) || // A-Z
      (b >= 0x61 && b <= 0x7a) || // a-z
      b === 0x2d || // -
      b === 0x2e || // .
      b === 0x5f || // _
      b === 0x2a // *
    ) {
      out += String.fromCharCode(b);
    } else if (b === 0x20) {
      out += '+';
    } else {
      out += `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  return out;
}
