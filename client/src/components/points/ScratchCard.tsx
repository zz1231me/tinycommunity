// client/src/components/points/ScratchCard.tsx
// 결과 위를 덮었다가 긁어서 벗겨 내는 은박.
//
// 결과는 아래(children)에 이미 그려져 있고 이 캔버스가 그 위를 덮는다.
// 덮개일 뿐이므로 화면 낭독기는 결과를 바로 읽고, 캔버스를 쓸 수 없는 환경
// (구형 브라우저·테스트 러너)에서는 덮개 없이 결과가 그대로 보인다.
//
// 서버가 정한 결과를 바꾸지 않는다 — 여기서 하는 일은 보여 주는 시점을 늦추는 것뿐이다.

import { useCallback, useEffect, useRef, useState } from 'react';

interface ScratchCardProps {
  /** 덮개 아래에 놓일 결과 */
  children: React.ReactNode;
  /** 덮개가 걷혔을 때 (긁어서 열었든, 버튼으로 열었든) */
  onRevealed?: () => void;
  /** 덮개 위에 적을 안내 문구 */
  hint?: string;
}

/** 이만큼 긁으면 나머지는 알아서 걷힌다. 끝까지 긁게 하면 재미가 아니라 노동이 된다. */
const REVEAL_RATIO = 0.45;

/** 긁는 붓의 굵기(CSS px) */
const BRUSH = 26;

export function ScratchCard({ children, onRevealed, hint = '긁어서 확인' }: ScratchCardProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const revealedRef = useRef(false);
  const sampleTick = useRef(0);

  const [revealed, setRevealed] = useState(false);
  /** 캔버스를 쓸 수 없으면 덮개 자체를 만들지 않는다 */
  const [usable, setUsable] = useState(true);

  const finish = useCallback(() => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    setRevealed(true);
    onRevealed?.();
  }, [onRevealed]);

  /** 은박을 그린다. 크기가 바뀌면 다시 그린다. */
  const paintCover = useCallback(
    (canvas: HTMLCanvasElement, w: number, h: number) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setUsable(false);
        return null;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const dark = document.documentElement.classList.contains('dark');
      const g = ctx.createLinearGradient(0, 0, w, h);
      if (dark) {
        g.addColorStop(0, '#475569');
        g.addColorStop(0.5, '#64748b');
        g.addColorStop(1, '#334155');
      } else {
        g.addColorStop(0, '#cbd5e1');
        g.addColorStop(0.5, '#e2e8f0');
        g.addColorStop(1, '#94a3b8');
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // 은박처럼 보이도록 옅은 결을 얹는다
      ctx.globalAlpha = dark ? 0.06 : 0.09;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      for (let x = -h; x < w; x += 7) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + h, h);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = dark ? 'rgba(226,232,240,0.85)' : 'rgba(51,65,85,0.75)';
      ctx.font = '600 14px system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hint, w / 2, h / 2);
      return ctx;
    },
    [hint]
  );

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const rect = wrap.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      // 크기를 잴 수 없으면 덮지 않는다 — 결과를 가린 채 열 수 없는 상태가 되면 안 된다.
      setUsable(false);
      return;
    }
    if (!paintCover(canvas, rect.width, rect.height)) return;

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      if (revealedRef.current) return;
      const r = entries[0]?.contentRect;
      if (r && r.width > 0 && r.height > 0) paintCover(canvas, r.width, r.height);
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [paintCover]);

  /** 지금까지 얼마나 벗겨졌는지. 매 움직임마다 재면 무거워서 몇 번에 한 번만 잰다. */
  const clearedRatio = (canvas: HTMLCanvasElement): number => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return 1;
    const { width, height } = canvas;
    const step = 8;
    let clear = 0;
    let total = 0;
    const data = ctx.getImageData(0, 0, width, height).data;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        total += 1;
        if (data[(y * width + x) * 4 + 3] < 24) clear += 1;
      }
    }
    return total === 0 ? 1 : clear / total;
  };

  const scratchAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || revealedRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = wrap.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = BRUSH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const last = lastRef.current;
    ctx.beginPath();
    if (last) {
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.arc(x, y, BRUSH / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    lastRef.current = { x, y };

    sampleTick.current += 1;
    if (sampleTick.current % 6 === 0 && clearedRatio(canvas) >= REVEAL_RATIO) finish();
  };

  if (!usable || revealed) {
    return <div className="relative">{children}</div>;
  }

  return (
    <div ref={wrapRef} className="relative select-none">
      {children}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full cursor-pointer touch-none rounded-xl"
        onPointerDown={e => {
          drawingRef.current = true;
          lastRef.current = null;
          e.currentTarget.setPointerCapture(e.pointerId);
          scratchAt(e.clientX, e.clientY);
        }}
        onPointerMove={e => {
          if (!drawingRef.current) return;
          scratchAt(e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          drawingRef.current = false;
          lastRef.current = null;
        }}
        onPointerLeave={() => {
          drawingRef.current = false;
          lastRef.current = null;
        }}
      />
      {/* 긁기 어려운 상황(키보드만 쓰거나, 화면을 오래 누르기 힘든 경우)을 위한 통로 */}
      <button
        type="button"
        onClick={finish}
        className="absolute bottom-1.5 right-2 rounded-md bg-black/25 px-2 py-1 text-2xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-black/40"
      >
        바로 확인
      </button>
    </div>
  );
}
