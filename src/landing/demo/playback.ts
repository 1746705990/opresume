/**
 * 落地页演示动画的播放控制器。
 *
 * 演示岛与编辑器组件解耦：视觉复刻 + 复用产品纯逻辑（diff 算法等），内容预编排。
 * 本模块提供三块基建：
 * - useDemoLang：订阅 landing:lang，与静态文案同帧切换（契约同 main.tsx useLandingLang）
 * - useDemoLoop：进入视口启动、离开暂停的时间轴循环；prefers-reduced-motion 时不启动
 * - sleep/animate：可中断的时序原语，取消后立刻返回，不产生跨循环的脏状态
 */
import { useEffect, useRef, useState } from 'react';
import i18n from '@/i18n';

export const LANG_EVENT = 'landing:lang';

/** 岛内语言状态：与静态文案同帧更新（flushSync 由事件派发方保证） */
export function useDemoLang(): string {
  const [lang, setLang] = useState(() => i18n.language);
  useEffect(() => {
    const onLang = (e: Event) => setLang((e as CustomEvent<string>).detail);
    window.addEventListener(LANG_EVENT, onLang);
    return () => window.removeEventListener(LANG_EVENT, onLang);
  }, []);
  return lang;
}

/**
 * 视口进入跟踪：inView 为 true 期间演示循环运行，离开即暂停。
 * rootMargin 提前预载，滚动到位时动画已在开场帧。
 */
export function useInView<T extends HTMLElement>(rootMargin = '160px'): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);
  return [ref, inView];
}

type CancelCheck = () => boolean;

/** 可中断 sleep：cancel 时提前 ~1 帧返回，避免时序拖尾 */
export function sleep(ms: number, check?: CancelCheck): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      if (check?.() || performance.now() - start >= ms) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * rAF 驱动的进度动画：onUpdate 收到 0..1 的 eased 进度。
 * 返回是否完整跑完（false = 被取消）。
 */
export function animate(
  ms: number,
  onUpdate: (progress: number) => void,
  check?: CancelCheck,
): Promise<boolean> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      if (check?.()) {
        resolve(false);
        return;
      }
      const elapsed = performance.now() - start;
      if (elapsed >= ms) {
        onUpdate(1);
        resolve(true);
        return;
      }
      onUpdate(elapsed / ms);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * 演示循环：enabled 期间反复执行 timeline，取消/暂停安全。
 * resetKey（如界面语言）变化时立即中止当前轮并从头重播，
 * 避免文案长度变化导致选区/光标等测量数据与画面错位。
 * timeline 内所有 sleep/animate 必须传入 check，保证暂停时状态冻结、
 * 重启时从时间轴头部重来（组件状态由时间轴第一步统一复位）。
 */
export function useDemoLoop(
  enabled: boolean,
  timeline: (check: CancelCheck) => Promise<void>,
  resetKey?: string,
): void {
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const check = () => cancelled;
    void (async () => {
      while (!check()) {
        await timelineRef.current(check);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, resetKey]);
}
