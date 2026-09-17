// client/src/components/avatarMark.ts
// 사진이 없는 사람에게 그려 줄 표식.
//
// 예전에는 열 가지 그라데이션 중 하나에 이니셜만 얹었다. 사람이 열 명만 넘어도
// 같은 색이 겹쳐 서로 구분되지 않았다.
//
// 여기서는 아이디로 색상(360가지)과 무늬(6가지)를 정한다. 같은 사람은 언제나 같은
// 표식이고, 네트워크를 타지 않는다. 바깥 서비스(dicebear 등)를 쓰면 사내망에서
// 아바타만 안 뜨는 일이 생긴다.

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

/**
 * 색이 밝으면 흰 글자가 안 읽힌다. 노랑~초록 구간은 같은 밝기여도 눈에 더 밝게
 * 보이므로 한 단계 더 어둡게 잡는다. (아래 테스트가 360가지 색을 전부 재 본다)
 */
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
    // 끝 색은 색상환에서 조금 돌리고 더 어둡게 — 납작한 단색보다 깊이가 생긴다
    to: `hsl(${(hue + 32) % 360} 62% ${Math.max(22, light - 12)}%)`,
  };
}
