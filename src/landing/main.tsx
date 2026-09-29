/**
 * 落地页动效岛：静态 index.html 承载中文 SEO 内容与首帧，本模块负责语言切换按钮
 * 与 CTA 的 layout 动画。切换唯一入口 window.__landingSwitchLang：
 * changeLanguage + 替换静态文案 + dispatch('landing:lang') → 岛内 flushSync 同帧同步。
 * editor.html 不引入本模块，两页语言经 src/i18n（localStorage: opresume_ui_lang）互通。
 */
import { StrictMode, useEffect, useId, useState, type ComponentProps, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import i18n, { LANGUAGES } from '@/i18n';
import './landing.css';

const LANG_EVENT = 'landing:lang';

declare global {
  interface Window {
    /** index.html 内联脚本定义；仅用 preventDefault，兼容 React 合成事件 */
    startApp(e?: { preventDefault(): void }, source?: string): void;
    /** Clarity 埋点（未注入统计时为空操作） */
    trackClarityEvent(eventName: string): void;
    markStarPromptClicked(): void;
    /** 语言切换唯一入口，本模块挂载后可用 */
    __landingSwitchLang?: (lang: string) => void;
    /** 岛挂载完成标记：外部脚本可据此停止维护静态兜底 UI */
    __landingIslandsMounted?: boolean;
  }
}

/** 岛内语言状态：flushSync 保证与静态文案同帧更新，layout 动画共享同一渲染起点 */
function useLandingLang(): string {
  const [lang, setLang] = useState(() => i18n.language);
  useEffect(() => {
    const onLang = (e: Event) => {
      const next = (e as CustomEvent<string>).detail;
      flushSync(() => setLang(next));
    };
    window.addEventListener(LANG_EVENT, onLang);
    return () => window.removeEventListener(LANG_EVENT, onLang);
  }, []);
  return lang;
}

/** 布局过渡与编辑器 LangSwitcher 同源（0.35s [0.16,1,0.3,1]） */
const LAYOUT_TRANSITION = {
  duration: 0.35,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
} as const;
const TRANSITION_NONE = { duration: 0 } as const;

function useIslandTransition() {
  return useReducedMotion() ? TRANSITION_NONE : LAYOUT_TRANSITION;
}

/** 语言切换按钮（样式见 landing.css）；motion.div layout 使重排时位置平滑补偿 */
function LandingLangSwitcher({ lang }: { lang: string }) {
  const pillTransition = useIslandTransition();

  return (
    <motion.div layout transition={pillTransition} className="lang-switch">
      {LANGUAGES.map((l) => {
        const active = lang === l.code;
        return (
          <button
            key={l.code}
            type="button"
            className={active ? 'lang-switch-btn is-active' : 'lang-switch-btn'}
            onClick={() => {
              window.trackClarityEvent(`landing_lang_${l.code}_clicked`);
              window.__landingSwitchLang?.(l.code);
            }}
          >
            {active && (
              <motion.span layoutId="landing-lang-pill" className="lang-switch-pill" transition={pillTransition} />
            )}
            {/* z-1：否则文字被 absolute 胶囊遮住 */}
            <span className="lang-switch-label">{l.label}</span>
          </button>
        );
      })}
    </motion.div>
  );
}

/** Star on GitHub：视觉复用静态 .github-star-btn（两语言文案固定）；layout 使重排平滑 */
function LandingGithubStar({ count }: { count: string | null }) {
  const transition = useIslandTransition();

  return (
    <motion.a
      layout
      transition={transition}
      className="github-star-btn"
      href="https://github.com/oopooa/opresume"
      target="_blank"
      rel="noopener"
      aria-label="Star OpResume on GitHub"
      onClick={() => {
        window.trackClarityEvent('github_header_clicked');
        window.markStarPromptClicked();
      }}
    >
      <svg className="github-star-btn__icon" viewBox="0 0 24 24" aria-hidden="true">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
      <span>Star on GitHub</span>
      <span className="github-star-btn__divider" aria-hidden="true" />
      <span className="github-star-btn__count">{count ?? '—'}</span>
    </motion.a>
  );
}

/** CTA 按钮：layout 使语言切换时的宽度变化平滑过渡（复用静态按钮视觉类） */
function IslandCta({
  variant,
  tKey,
  source,
  withArrow = false,
}: {
  variant: 'nav' | 'primary';
  tKey: string;
  source: string;
  withArrow?: boolean;
}) {
  const { t } = useTranslation();
  const transition = useIslandTransition();

  const arrow = (
    <svg className="btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );

  if (variant === 'nav') {
    return (
      <motion.button
        type="button"
        layout
        transition={transition}
        className="nav-btn"
        whileHover={{ scale: 0.96 }}
        onClick={(e) => window.startApp(e, source)}
      >
        <span>{t(tKey)}</span>
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      layout
      transition={transition}
      className="btn btn-primary"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={(e) => window.startApp(e, source)}
    >
      <span>{t(tKey)}</span>
      {withArrow && arrow}
    </motion.button>
  );
}

/** 替换 data-i18n* 标记的静态节点，并同步 html lang / title / meta description */
function applyStaticCopy() {
  const { t } = i18n;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => {
    const key = el.dataset.i18nHtml;
    if (key) el.innerHTML = t(key); // 字典为仓库内静态资源，非用户输入
  });
  document.querySelectorAll<HTMLImageElement>('[data-i18n-alt]').forEach((el) => {
    const key = el.dataset.i18nAlt;
    if (key) el.alt = t(key);
  });
  document.documentElement.lang = i18n.language;
  document.title = t('landing.meta.title');
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute('content', t('landing.meta.description'));
}

/** 语言切换唯一收敛点（岛内按钮与未来外部入口都走这里） */
function switchLanguage(lang: string) {
  // changeLanguage 自动写 localStorage(opresume_ui_lang)，编辑器经 detector 读取实现互通
  i18n.changeLanguage(lang);
  applyStaticCopy();
  window.dispatchEvent(new CustomEvent<string>(LANG_EVENT, { detail: lang }));
}

/** nav 右侧按钮组单岛：语言切换或 star 数变化引起的 flex 重排一次渲染内完成，
 *  framer 对全组 layout 元素同帧补偿，避免"按钮动了、邻居瞬跳" */
function NavIsland() {
  const lang = useLandingLang(); // 本岛唯一语言订阅点，子组件靠 root 级联重渲染
  const groupId = useId(); // 隔离 layoutId 命名空间
  const [starCount, setStarCount] = useState<string | null>(null);

  useEffect(() => {
    // star 数：1 小时缓存避开未授权 API 限流，失败时静默保留占位符；
    // state 提升到岛根，数字填充引起宽度变化时邻居一并补偿
    const cacheKey = 'opresume:github-stars';
    const ttl = 60 * 60 * 1000;
    const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null') as { t: number; n: number } | null;
      if (cached && Date.now() - cached.t < ttl) {
        setStarCount(fmt(cached.n));
        return;
      }
    } catch { /* 缓存损坏走网络 */ }
    let cancelled = false;
    fetch('https://api.github.com/repos/oopooa/opresume')
      .then((r) => (r.ok ? (r.json() as Promise<{ stargazers_count?: number } | null>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        const n = data.stargazers_count ?? 0;
        setStarCount(fmt(n));
        try { localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), n })); } catch { /* 隐私模式下忽略 */ }
      })
      .catch(() => { /* 离线/限流保留占位符 */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <LayoutGroup id={groupId}>
      <LandingLangSwitcher lang={lang} />
      <LandingGithubStar count={starCount} />
      <IslandCta variant="nav" tKey="landing.nav.start" source="header" />
    </LayoutGroup>
  );
}

/** 独立 CTA 岛根：持有语言订阅，切换时 flushSync 与静态文案同帧重渲染 */
function CtaIsland(props: ComponentProps<typeof IslandCta>) {
  useLandingLang();
  return <IslandCta {...props} />;
}

const ISLANDS: Array<{ id: string; element: ReactElement }> = [
  { id: 'nav-island', element: <NavIsland /> },
  { id: 'hero-cta', element: <CtaIsland variant="primary" tKey="landing.hero.start" source="hero" withArrow /> },
  { id: 'final-cta', element: <CtaIsland variant="primary" tKey="landing.final.start" source="bottom" withArrow /> },
];

function mountIslands() {
  for (const { id, element } of ISLANDS) {
    const container = document.getElementById(id);
    if (!container) continue;
    // flushSync：防止"清空容器"与"渲染完成"被并发调度拆两帧导致按钮闪没
    flushSync(() => {
      createRoot(container).render(<StrictMode>{element}</StrictMode>);
    });
  }
}

/** 演示动画岛：进入视口才动态加载对应 chunk（vite 自动拆分 JS+CSS，不占首屏） */
const DEMO_ISLANDS: Array<{ id: string; load: () => Promise<{ default: () => ReactElement }> }> = [
  { id: 'demo-polish', load: () => import('./demo/PolishDemo') },
  { id: 'demo-drag', load: () => import('./demo/DragDemo') },
  { id: 'demo-privacy', load: () => import('./demo/PrivacyDemo') },
  { id: 'demo-pdf', load: () => import('./demo/PdfDemo') },
];

function mountDemoIslands() {
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const island = DEMO_ISLANDS.find((d) => d.id === entry.target.id);
        if (!island || entry.target.childElementCount > 0) continue;
        void island.load().then(({ default: Demo }) => {
          const host = document.getElementById(island.id);
          if (!host || host.childElementCount > 0) return;
          createRoot(host).render(<StrictMode><Demo /></StrictMode>);
        });
      }
    },
    { rootMargin: '160px' },
  );
  for (const { id } of DEMO_ISLANDS) {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  }
}

window.__landingSwitchLang = switchLanguage;

// module 为 defer 语义，DOM 已就绪：先替换静态文案（英文用户无中文闪变），
// 再挂岛，最后解除 head 预检的正文隐藏
switchLanguage(i18n.language);
mountIslands();
mountDemoIslands();
window.__landingIslandsMounted = true;
document.documentElement.classList.remove('i18n-pending');
