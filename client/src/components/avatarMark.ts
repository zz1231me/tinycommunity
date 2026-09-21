// 사진 없는 사용자의 표식. 아이디로 색상과 무늬를 정해 네트워크 없이 항상 같은 표식을 만든다.

export type Motif = 'arc' | 'band' | 'wedge' | 'grid' | 'orb' | 'chevron';

const MOTIFS: Motif[] = ['arc', 'band', 'wedge', 'grid', 'orb', 'chevron'];

/** 문자열 → 32비트 정수. 같은 입력이면 항상 같은 값. */
export function hashOf(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/** 노랑~초록 구간은 같은 밝기여도 밝게 보이므로 한 단계 더 어둡게 잡는다. */
function lightnessFor(hue: number): number {
  if (hue >= 30 && hue < 210) return 27;
  if (hue >= 210 && hue < 265) return 40;
  return 36;
}

export interface AvatarMark {
  hue: number;
  motif: Motif;
  /** 바탕 그라데이션 두 끝 */
  from: string;
  to: string;
}

export function markFor(seed: string): AvatarMark {
  const hash = hashOf(seed || '?');
  const hue = hash % 360;
  const light = lightnessFor(hue);
  return {
    hue,
    motif: MOTIFS[(hash >> 9) % MOTIFS.length],
    from: `hsl(${hue} 58% ${light}%)`,
    // 끝 색은 색상환에서 조금 돌리고 더 어둡게 잡는다.
    to: `hsl(${(hue + 32) % 360} 62% ${Math.max(22, light - 12)}%)`,
  };
}
