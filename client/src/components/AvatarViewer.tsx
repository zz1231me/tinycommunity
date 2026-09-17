// client/src/components/AvatarViewer.tsx
// 프로필 사진을 크게 보는 작은 화면.
//
// ImageViewer 를 쓰지 않는다. 그쪽은 첨부된 큰 사진용이라 열 때 scale=1 로 두고
// 원본 픽셀 그대로 그린다(max-w-none). 아바타는 서버가 정사각 200px 로 줄여
// 저장하므로, 그 뷰어로 열면 까만 전체 화면 한가운데 200px 짜리가 덩그러니 뜬다.
//
// 대신 ModalShell 을 쓴다 — ESC 닫기·바깥 클릭 닫기·포커스 가두기·포커스 되돌리기가
// 이미 들어 있어 접근성을 다시 만들 필요가 없다.

import { ModalShell } from './common/ModalShell';

interface Props {
  /** 이미 검증된 아바타 URL (Avatar 가 프로토콜 검사를 마친 값) */
  src: string;
  name: string;
  onClose: () => void;
}

// 원본이 200px 이라 무한정 늘리면 또렷해지는 게 아니라 흐려지기만 한다.
// 화면을 꽉 채우는 대신 상한을 두고, 작은 화면에서는 폭에 맞춘다.
const MAX_PX = 400;

export function AvatarViewer({ src, name, onClose }: Props) {
  return (
    <ModalShell label={`${name}님의 프로필 사진`} onClose={onClose} className="w-auto">
      <div className="flex flex-col items-center gap-3 p-4">
        <img
          src={src}
          alt={`${name}님의 프로필 사진`}
          style={{ maxWidth: MAX_PX, maxHeight: MAX_PX }}
          className="w-[80vmin] rounded-xl object-contain"
        />
        <p className="max-w-full truncate text-sm font-medium text-slate-700 dark:text-slate-200">
          {name}
        </p>
      </div>
    </ModalShell>
  );
}
