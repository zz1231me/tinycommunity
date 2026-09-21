// 사진 없는 사용자의 아바타 바탕. 무늬는 이니셜을 가리지 않게 흰색 9~14% 로만 깐다.
import React from 'react';
import type { AvatarMark } from './avatarMark';

const SOFT = 'rgba(255,255,255,0.14)';
const SOFTER = 'rgba(255,255,255,0.09)';

/** 100×100 좌표계에 그리는 무늬 */
function Motif({ motif }: { motif: AvatarMark['motif'] }) {
  switch (motif) {
    case 'arc':
      return (
        <>
          <circle cx="100" cy="0" r="76" fill={SOFTER} />
          <circle cx="100" cy="0" r="46" fill={SOFT} />
        </>
      );
    case 'band':
      return <path d="M-20 76 L120 16 L120 46 L-20 106 Z" fill={SOFT} />;
    case 'wedge':
      return <path d="M0 100 L100 100 L100 32 Z" fill={SOFT} />;
    case 'grid':
      return (
        <>
          {[18, 50, 82].map(y =>
            [18, 50, 82].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="7" fill={SOFTER} />)
          )}
        </>
      );
    case 'orb':
      return (
        <>
          <circle cx="20" cy="22" r="40" fill={SOFTER} />
          <circle cx="86" cy="88" r="30" fill={SOFT} />
        </>
      );
    case 'chevron':
    default:
      return <path d="M-10 28 L50 64 L110 28 L110 56 L50 92 L-10 56 Z" fill={SOFT} />;
  }
}

interface Props {
  mark: AvatarMark;
  initials: string;
}

export const AvatarMarkSvg: React.FC<Props> = ({ mark, initials }) => {
  // 한 화면에 여러 아바타가 뜨므로 gradient id 가 겹치지 않게 한다.
  const gradientId = `avatar-mark-${React.useId()}`;
  // 두 글자(영문 이니셜)는 원 밖으로 밀려나지 않게 줄인다.
  const fontSize = initials.length > 1 ? 34 : 44;

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={mark.from} />
          <stop offset="100%" stopColor={mark.to} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${gradientId})`} />
      <Motif motif={mark.motif} />
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#ffffff"
        fontSize={fontSize}
        fontWeight="600"
        letterSpacing={initials.length > 1 ? '-1' : undefined}
      >
        {initials}
      </text>
    </svg>
  );
};
