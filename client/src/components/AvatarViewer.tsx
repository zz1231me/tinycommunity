// 프로필 사진을 크게 보는 작은 화면.
// 아바타는 200px 정사각이라 원본 크기로 그리는 ImageViewer 가 아니라 ModalShell 을 쓴다.

import { ModalShell } from './common/ModalShell';

interface Props {
  /** 이미 검증된 아바타 URL (Avatar 가 프로토콜 검사를 마친 값) */
  src: string;
  name: string;
  onClose: () => void;
}

// 원본이 200px 이라 상한을 두고, 작은 화면에서는 폭에 맞춘다.
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
