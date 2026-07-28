// client/src/utils/identicon.ts
// 외부 서비스 없이 코드로 '현대적인' 랜덤 아바타를 생성한다.
// 도트 그리드(구식) 대신 그라디언트 + 소프트 오브/링/기하 스타일을 랜덤으로 그려,
// 클릭할 때마다 세련되고 다양한 결과가 나온다. canvas → PNG File로 반환해
// 기존 아바타 업로드 파이프라인(서버 sharp 처리·저장)을 그대로 재사용한다.

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

// 배경: 두 조화 색조의 대각선 그라디언트
function paintGradientBg(ctx: CanvasRenderingContext2D, size: number, h1: number, h2: number) {
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, hsl(h1, 72, 58));
  g.addColorStop(1, hsl(h2, 70, 48));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

// 스타일 A — 떠다니는 소프트 오브
function drawOrbs(ctx: CanvasRenderingContext2D, size: number, h1: number, h2: number) {
  paintGradientBg(ctx, size, h1, h2);
  const n = Math.floor(rand(3, 6));
  for (let i = 0; i < n; i++) {
    const r = rand(size * 0.18, size * 0.42);
    const x = rand(0, size);
    const y = rand(0, size);
    const hue = Math.random() < 0.5 ? h1 : h2;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, hsl(hue + rand(-20, 20), 85, 72, 0.55));
    grad.addColorStop(1, hsl(hue, 80, 60, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 스타일 B — 동심원 링
function drawRings(ctx: CanvasRenderingContext2D, size: number, h1: number, h2: number) {
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.7);
  g.addColorStop(0, hsl(h1, 70, 60));
  g.addColorStop(1, hsl(h2, 65, 42));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const cx = rand(size * 0.35, size * 0.65);
  const cy = rand(size * 0.35, size * 0.65);
  const rings = Math.floor(rand(3, 6));
  for (let i = rings; i >= 1; i--) {
    ctx.beginPath();
    ctx.arc(cx, cy, (size * 0.42 * i) / rings, 0, Math.PI * 2);
    ctx.fillStyle = hsl(i % 2 ? h1 : h2, 80, i % 2 ? 72 : 52, 0.5);
    ctx.fill();
  }
}

// 스타일 C — 겹치는 기하 도형
function drawGeometric(ctx: CanvasRenderingContext2D, size: number, h1: number, h2: number) {
  paintGradientBg(ctx, size, h1, h2);
  ctx.globalAlpha = 0.6;
  // 큰 원
  ctx.beginPath();
  ctx.arc(rand(size * 0.3, size * 0.7), rand(size * 0.3, size * 0.7), rand(size * 0.25, size * 0.4), 0, Math.PI * 2);
  ctx.fillStyle = hsl(h2, 85, 70);
  ctx.fill();
  // 삼각형
  ctx.beginPath();
  ctx.moveTo(rand(0, size), rand(0, size));
  ctx.lineTo(rand(0, size), rand(0, size));
  ctx.lineTo(rand(0, size), rand(0, size));
  ctx.closePath();
  ctx.fillStyle = hsl(h1, 85, 78);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export async function generateRandomAvatarFile(): Promise<File> {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지를 생성할 수 없습니다(canvas 미지원).');

  const h1 = Math.floor(Math.random() * 360);
  const h2 = (h1 + Math.floor(rand(25, 120))) % 360; // 조화로운 두 번째 색조

  const styles = [drawOrbs, drawRings, drawGeometric];
  styles[Math.floor(Math.random() * styles.length)](ctx, size, h1, h2);

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('이미지 생성에 실패했습니다.');
  return new File([blob], `avatar_${Date.now()}.png`, { type: 'image/png' });
}
