export type VttCue = {
  start: number;
  end: number;
  text: string;
};

function parseTimestamp(value: string): number {
  const parts = value.trim().replace(',', '.').split(':');
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return Number(h) * 3600 + Number(m) * 60 + Number(s);
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return Number(m) * 60 + Number(s);
  }
  return Number(value) || 0;
}

export function parseVtt(content: string): VttCue[] {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r/g, '');
  const blocks = normalized.split(/\n\n+/);
  const cues: VttCue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean);
    if (!lines.length) continue;
    if (lines[0].startsWith('WEBVTT') || lines[0].startsWith('NOTE')) continue;

    let timeLine = lines[0];
    let textLines = lines.slice(1);
    if (!timeLine.includes('-->') && lines[1]?.includes('-->')) {
      timeLine = lines[1];
      textLines = lines.slice(2);
    }
    if (!timeLine.includes('-->')) continue;

    const [startRaw, endRaw] = timeLine.split('-->').map((s) => s.trim().split(' ')[0]);
    const start = parseTimestamp(startRaw);
    const end = parseTimestamp(endRaw);
    const text = textLines
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (!text) continue;
    cues.push({ start, end, text });
  }

  return cues;
}

export function cueAtTime(cues: VttCue[], time: number): VttCue | null {
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (time >= cue.start && time <= cue.end) return cue;
  }
  return null;
}
