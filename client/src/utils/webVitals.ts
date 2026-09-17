// client/src/utils/webVitals.ts - Web Vitals 모니터링
import { onCLS, onINP, onLCP, onFCP, onTTFB, Metric } from 'web-vitals';

/**
 * Web Vitals 메트릭 타입
 */
export type WebVitalName = 'CLS' | 'INP' | 'LCP' | 'FCP' | 'TTFB';

export interface WebVitalMetric {
  name: WebVitalName;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
}

type ReportHandler = (metric: WebVitalMetric) => void;

/**
 * 콘솔에 메트릭 출력
 */
const logMetric = (metric: Metric) => {
  if (!import.meta.env.DEV) return;
  const { name, value, rating, id, delta } = metric;
  const color = rating === 'good' ? '🟢' : rating === 'needs-improvement' ? '🟡' : '🔴';

  console.info(`${color} [Web Vitals] ${name}: ${value.toFixed(2)} (${rating})`);
  console.info(`  └─ delta: ${delta.toFixed(2)}, id: ${id}`);
};

/**
 * Web Vitals 모니터링 초기화
 */
export function initWebVitals(onReport?: ReportHandler) {
  const handler = (metric: Metric) => {
    logMetric(metric);

    if (onReport) {
      onReport(metric as WebVitalMetric);
    }
  };

  // Core Web Vitals
  onCLS(handler);
  onINP(handler);
  onLCP(handler);

  // 추가 Vitals
  onFCP(handler);
  onTTFB(handler);

  if (import.meta.env.DEV) console.info('📊 [Web Vitals] 모니터링 시작됨');
}
