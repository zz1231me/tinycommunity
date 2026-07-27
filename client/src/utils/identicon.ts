// client/src/utils/identicon.ts
// 외부 서비스 없이 코드로 랜덤 아바타(좌우 대칭 identicon)를 생성한다.
// canvas에 그려 PNG File로 반환하므로, 기존 아바타 업로드 파이프라인(서버 sharp 처리·저장)을
// 그대로 재사용할 수 있다. 클릭할 때마다 새 색조/패턴이 나온다.
export async function generateRandomAvatarFile(): Promise<File> {
  const size = 256; // 서버에서 avatarSizePx로 다시 리사이즈되므로 넉넉히
  const grid = 5; // 5x5 셀, 좌우 대칭
  const cell = Math.floor(size / (grid + 1));
  const pad = Math.floor((size - cell * grid) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지를 생성할 수 없습니다(canvas 미지원).');

  const hue = Math.floor(Math.random() * 360);
  // 배경: 같은 색조의 아주 옅은 톤 / 전경: 채도·명도 고정으로 항상 보기 좋은 색
  ctx.fillStyle = `hsl(${hue}, 30%, 95%)`;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = `hsl(${hue}, 60%, 50%)`;

  const halfCols = Math.ceil(grid / 2); // 5 → 3 (가운데 열 포함)
  for (let x = 0; x < halfCols; x++) {
    for (let y = 0; y < grid; y++) {
      if (Math.random() < 0.5) {
        ctx.fillRect(pad + x * cell, pad + y * cell, cell, cell);
        // 좌우 대칭으로 같은 행의 반대편 셀도 채움
        ctx.fillRect(pad + (grid - 1 - x) * cell, pad + y * cell, cell, cell);
      }
    }
  }

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('이미지 생성에 실패했습니다.');
  return new File([blob], `identicon_${Date.now()}.png`, { type: 'image/png' });
}
