/**
 * 落地页「AI 润色」程序化演示：复刻编辑器划词润色的完整交互流，
 * 内容预编排（不真调 AI），diff 由产品同源算法 applyInlineDiff 实时计算，
 * 文案随落地页语言实时切换。进入视口自动循环播放。
 *
 * 时间轴：划词 → 润色浮层 → 对话框 → 打字机流式 → 预览 → 红绿 diff → 循环。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion, AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Eye, Loader2, Scissors, Sparkles } from 'lucide-react';
import { getSampleResume } from '@/config/sample-resume';
import { applyInlineDiff, countWords, extractText } from '@/utils/text-diff';
import { animate, sleep, useDemoLang, useDemoLoop, useInView, LANG_EVENT } from './playback';
import './landing-demo.css';

type Phase = 'idle' | 'select' | 'overlay' | 'dialog' | 'typing' | 'preview' | 'diff';

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** 从样例简历取背景展示文案；划词原文来自字典（刻意保留口语化/无量化的润色空间） */
function getCopy(lang: string, presentText: string) {
  const sample = getSampleResume(lang);
  const work = sample.work ?? [];
  // work 元素的 x-op- 扩展字段不在 JsonResume 类型上，演示按动态字段读取
  const readDescHtml = (item: unknown): string =>
    (item as Record<string, unknown> | null)?.['x-op-workDescHtml'] as string | undefined ?? '';
  const allLi = (item: unknown): string[] =>
    [...readDescHtml(item).matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => extractText(m[1]).trim());
  const secondItem = work[1];
  const secondLis = allLi(secondItem);
  // 日期区间：空 endDate 视为在职中，显示「至今/Present」
  const dateRange = (item: unknown): string => {
    const w = item as Record<string, unknown> | null;
    const start = (w?.startDate as string | undefined) ?? '';
    const end = (w?.endDate as string | undefined) ?? '';
    const endText = end ? (/^present$|^至今$/i.test(end) ? presentText : end) : presentText;
    return [start, endText].filter(Boolean).join(' - ');
  };
  return {
    company: work[0]?.name ?? '',
    date: dateRange(work[0]),
    company2: secondItem?.name ?? '',
    date2: dateRange(secondItem),
    secondLi: secondLis[0] ?? '',
    education: sample.education?.[0],
    skills: (sample.skills ?? []).slice(0, 4).map((sk) => sk.name),
  };
}

export default function PolishDemo() {
  const lang = useDemoLang();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [rootRef, inView] = useInView<HTMLDivElement>();

  const lineRef = useRef<HTMLSpanElement>(null);
  const toggleRef = useRef<HTMLSpanElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [sel, setSel] = useState(0);
  const [typed, setTyped] = useState(0);
  const [showDiff, setShowDiff] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(false);
  const [cursorPress, setCursorPress] = useState(false);
  const [togglePress, setTogglePress] = useState(false);
  const [bubblePos, setBubblePos] = useState({ x: 0, y: 0 });
  /** 划词行的逐行矩形（相对 select-line，真实测量换行），选区按行扫过 */
  const [lineRects, setLineRects] = useState<Array<{ top: number; left: number; width: number; height: number }>>([]);
  // 光标位置直写 transform（与选区条同帧同步），显隐/按压走 CSS 过渡
  const cursorElRef = useRef<HTMLDivElement>(null);

  const copy = useMemo(() => getCopy(lang, t('field.present')), [lang, t]);
  const rewritten = t('landing.demo.polish.rewritten');
  const original = t('landing.demo.polish.original');

  // diff / 字数统计均走产品同源纯逻辑
  const diffHtml = useMemo(
    () => applyInlineDiff(`<p>${original}</p>`, `<p>${rewritten}</p>`),
    [original, rewritten],
  );
  const origCount = useMemo(() => countWords(`<p>${original}</p>`), [original]);
  const resultCount = useMemo(() => countWords(`<p>${rewritten}</p>`), [rewritten]);
  const delta = origCount > 0 ? Math.round(((resultCount - origCount) / origCount) * 100) : 0;

  const dialogOpen = phase === 'dialog' || phase === 'typing' || phase === 'preview' || phase === 'diff';
  const overlayOpen = phase === 'overlay';
  const typingDone = typed >= rewritten.length;
  const showingResult = reduceMotion || (dialogOpen && (phase !== 'typing' || typed > 0));

  // 光标位置直写 transform（与选区条在同一个 rAF 回调内写入，帧级同步）
  const cursorPosRef = useRef({ x: -100, y: -100 });
  const setCursorAt = (x: number, y: number, visible = true) => {
    cursorPosRef.current = { x, y };
    if (cursorElRef.current) {
      cursorElRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
    setCursorVisible(visible);
  };

  /** 离散移动：从当前位置滑到目标（逐帧直写，A→B 过程可见且与选区同机制） */
  const glideCursorTo = async (x: number, y: number, ms: number, check: () => boolean) => {
    const from = { ...cursorPosRef.current };
    await animate(ms, (p) => {
      const e = 1 - (1 - p) ** 3;
      setCursorAt(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    }, check);
  };

  // 语言切换时立即强制回到开场（跳过退出动画，避免旧弹窗以新语言闪现）
  useEffect(() => {
    setPhase('idle');
  }, [lang]);

  // 语言切换时同步强制回到开场：landing:lang 在切换的 flushSync 批内派发，
  // 此监听器同步复位 phase/选区/打字等状态，保证旧弹窗在浏览器绘制前就被卸载（无闪烁）；
  // 随后 useDemoLoop 的 resetKey(lang) 变化再从头重播并按新语言重新测量
  useEffect(() => {
    const onLangReset = () => {
      setPhase('idle');
      setSel(0);
      setTyped(0);
      setShowDiff(false);
      setCursorVisible(false);
      setCursorPress(false);
      setLineRects([]);
    };
    window.addEventListener(LANG_EVENT, onLangReset);
    return () => window.removeEventListener(LANG_EVENT, onLangReset);
  }, []);

  useDemoLoop(
    inView && !reduceMotion,
    async (check) => {
      // 复位：相对坐标每轮重测，语言切换/字体加载后依然对位
      setPhase('idle');
      setSel(0);
      setTyped(0);
      setShowDiff(false);
      setCursorVisible(false);
      await sleep(450, check);
      if (check()) return;

      const rootRect = rootRef.current?.getBoundingClientRect();
      const hostRect = lineRef.current?.getBoundingClientRect();
      const textEl = lineRef.current?.firstElementChild ?? lineRef.current;
      if (!rootRect || !hostRect || !textEl) return;

      // Range.getClientRects 真实测量文本每一行的矩形，选区据此逐行扫过
      const range = document.createRange();
      range.selectNodeContents(textEl);
      const rects = Array.from(range.getClientRects())
        .filter((r) => r.width > 2 && r.height > 0)
        .map((r) => ({
          top: r.top - hostRect.top, // marks 用（select-line 基准）
          left: r.left - hostRect.left,
          width: r.width,
          height: r.height,
          cx: r.left - rootRect.left, // 光标用（demo-root 基准）
          cy: r.top - rootRect.top,
        }));
      if (!rects.length) return;
      setLineRects(rects.map(({ top, left, width, height }) => ({ top, left, width, height })));

      const first = rects[0];
      const last = rects[rects.length - 1];
      const lines = rects.length;

      // 1. 光标入场（上方淡入）→ 滑到首行行首
      setPhase('select');
      setCursorAt(first.cx - 6, first.cy + first.height / 2 - 40);
      await sleep(220, check);
      if (check()) return;
      await glideCursorTo(first.cx, first.cy + first.height / 2, 520, check);
      if (check()) return;

      // 2. 按住拖选：逐行扫过（线性匀速，各行节奏一致），总时长放慢便于跟随
      const sweepDone = await animate(
        2000,
        (p) => {
          setSel(p);
          const pos = Math.min(p * lines, lines - 1e-4);
          const row = rects[Math.floor(pos)];
          const rowProg = pos - Math.floor(pos);
          setCursorAt(row.cx + row.width * rowProg, row.cy + row.height / 2);
        },
        check,
      );
      if (!sweepDone) return;
      await sleep(560, check);
      if (check()) return;

      // 3. 浮层弹出（锚定选区整体上方 = 首行顶部），光标滑到「润色」chip 上并点击
      setPhase('overlay');
      const bubbleX = first.cx + (last.cx + last.width - first.cx) * 0.1;
      const bubbleY = first.cy - 44;
      setBubblePos({ x: bubbleX, y: bubbleY });
      await sleep(430, check);
      if (check()) return;
      await glideCursorTo(bubbleX + 36, bubbleY + 14, 480, check);
      if (check()) return;
      setCursorPress(true);
      await sleep(150, check);
      if (check()) return;
      setCursorPress(false);
      await sleep(140, check);
      if (check()) return;

      // 4. 对话框弹出（浮层收起、光标离场），右栏立即进入 loading（与真实一致：点击即发请求）
      setPhase('dialog');
      setCursorVisible(false);
      await sleep(320, check);
      if (check()) return;

      // 5. spinner 短暂停留后打字机流式输出（时长随语言钳制，避免英文拖沓）
      setPhase('typing');
      await sleep(400, check);
      if (check()) return;
      const chars = Array.from(rewritten).length;
      const typingMs = Math.min(2600, Math.max(1200, chars * 26));
      const typingDone = await animate(typingMs, (p) => setTyped(Math.floor(p * chars)), check);
      if (!typingDone) return;

      // 6. 预览停留 → 光标完整大小淡入 → 按下 → 松开 → 停一拍 → 淡出 → 切红绿 diff
      setPhase('preview');
      await sleep(1100, check);
      if (check()) return;
      const btnRect = toggleRef.current?.getBoundingClientRect();
      const rr = rootRef.current?.getBoundingClientRect();
      const togglePos = btnRect && rr
        ? { x: btnRect.left - rr.left + btnRect.width / 2, y: btnRect.top - rr.top + btnRect.height / 2 }
        : { x: 566, y: 78 };
      setCursorAt(togglePos.x, togglePos.y);
      setCursorVisible(true); // 先以完整大小淡入
      setTogglePress(true); // 按钮同步按压
      await sleep(320, check);
      if (check()) return;
      setCursorPress(true); // 按下（光标收缩）
      await sleep(200, check);
      if (check()) return;
      setCursorPress(false); // 松开（光标恢复）
      await sleep(380, check);
      if (check()) return;
      setTogglePress(false);
      setCursorVisible(false); // 停一拍后再淡出
      setShowDiff(true);
      setPhase('diff');
      await sleep(2800, check);
      if (check()) return;

      // 7. 对话框收起，回到开场
      setPhase('idle');
      await sleep(520, check);
    },
    lang,
  );

  // reduced-motion：静态呈现最终 diff 帧
  const staticReduce = reduceMotion;
  const selWidth = staticReduce ? 1 : sel;
  const typedCount = staticReduce ? rewritten.length : typed;
  const phaseView: Phase = staticReduce ? 'diff' : phase;
  const showDiffView = staticReduce ? true : showDiff;

  const dialogVisible = staticReduce || dialogOpen;

  return (
    <div ref={rootRef} className="demo-root" aria-hidden="true">
      {/* 仿简历卡片 */}
      <div className="demo-resume">
        <div className="demo-module-title">{t('module.workExpList')}</div>
        <div className="demo-work-item">
          <div className="demo-work-head">
            <span className="demo-work-company">{copy.company}</span>
            <span className="demo-work-date">{copy.date}</span>
          </div>
          <ul className="demo-work-desc">
            <li>
              <span ref={lineRef} className="demo-select-line">
                <span>{original}</span>
                {selWidth > 0 &&
                  (lineRects.length
                    ? lineRects.map((r, i) => {
                        // 总进度按行数均分：第 i 行的本地扫描进度
                        const per = 1 / lineRects.length;
                        const local = Math.min(Math.max((selWidth - i * per) / per, 0), 1);
                        if (local <= 0) return null;
                        return (
                          <span
                            key={i}
                            className="demo-select-mark"
                            style={{ top: r.top - 1, left: r.left, width: r.width * local, height: r.height + 2 }}
                          />
                        );
                      })
                    // 静态帧（reduced-motion）未跑 timeline，无测量数据时整块覆盖
                    : (
                      <span
                        className="demo-select-mark"
                        style={{ top: -1, left: 0, width: '100%', height: 'calc(100% + 2px)' }}
                      />
                    ))}
              </span>
            </li>
          </ul>
        </div>
        <div className="demo-work-item">
          <div className="demo-work-head">
            <span className="demo-work-company">{copy.company2}</span>
            <span className="demo-work-date">{copy.date2}</span>
          </div>
          <ul className="demo-work-desc">
            <li>{copy.secondLi}</li>
          </ul>
        </div>

        <div className="demo-module-title">{t('module.educationList')}</div>
        <div className="demo-edu-row">
          <span className="demo-work-company">{copy.education?.institution}</span>
          <span className="demo-work-date">
            {[copy.education?.area, copy.education?.studyType].filter(Boolean).join(' · ')}
          </span>
        </div>

        <div className="demo-module-title">{t('module.skillList')}</div>
        <div className="demo-skill-tags">
          {copy.skills.map((name) => (
            <span key={name} className="demo-skill-tag">
              {name}
            </span>
          ))}
        </div>
      </div>

      {/* 润色浮层（选区上方居中偏左，复刻 PolishSelectionOverlay） */}
      <AnimatePresence key={`bubble-${lang}`}>
        {overlayOpen && !staticReduce && (
          <motion.div
            className="demo-bubble"
            initial={{ opacity: 0, scale: 0.7, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 4, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 22, mass: 0.6 }}
            style={{ left: bubblePos.x, top: bubblePos.y }}
          >
            <span className="demo-chip demo-chip--active">
              <Sparkles />
              {t('editor.polish.op.aiOptimize')}
            </span>
            <span className="demo-chip">
              <Scissors />
              {t('editor.polish.op.aiCondense')}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 润色对话框（复刻 PolishDialog 紧凑版）；key 随语言重挂，切语言时不播退出动画、无闪烁 */}
      <AnimatePresence key={`dialog-${lang}`}>
        {dialogVisible && (
          <motion.div
            className="demo-dialog-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.22 } }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="demo-dialog"
              initial={{ opacity: 0, scale: 0.92, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.18 } }}
              transition={{ duration: 0.32, ease: EASE_OUT }}
            >
              <div className="demo-dialog-header">
                <Sparkles />
                {t('editor.polish.dialogTitle')}
              </div>
              <div className="demo-panes">
                <div className="demo-panes-head">
                  <div className="demo-pane-label">
                    <span>{t('editor.polish.originalLabel')}</span>
                    <span className="demo-pane-count">
                      {t('editor.polish.wordCount', { count: origCount })}
                    </span>
                  </div>
                  <div className="demo-pane-label is-result">
                    <span>{t('editor.polish.polishedLabel')}</span>
                    <span className="demo-pane-tools">
                      {phaseView === 'preview' && (
                        <span ref={toggleRef} className={togglePress ? 'demo-diff-toggle is-press' : 'demo-diff-toggle'}>
                          <Eye />
                          {t('editor.polish.viewPreview')}
                        </span>
                      )}
                      {phaseView === 'diff' && (
                        <span ref={toggleRef} className={togglePress ? 'demo-diff-toggle is-press' : 'demo-diff-toggle'}>
                          <ArrowLeftRight />
                          {t('editor.polish.viewDiff')}
                        </span>
                      )}
                      {resultCount > 0 && (phaseView === 'preview' || phaseView === 'diff') && (
                        <span className="demo-pane-count">
                          {t('editor.polish.wordCount', { count: resultCount })}
                          <span className="demo-pane-count">
                            ({t('editor.polish.wordDelta', { sign: delta >= 0 ? '+' : '', percent: Math.abs(delta) })})
                          </span>
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                <div className="demo-panes-body">
                  <div className="demo-pane">{original}</div>
                  <div className="demo-pane">
                    {(phaseView === 'dialog' || phaseView === 'typing') && typedCount === 0 && !staticReduce && (
                      <div className="demo-pane-loading">
                        <Loader2 className="demo-spinner" />
                        <span>{t('editor.polish.loadingOp.optimize')}</span>
                      </div>
                    )}
                    {showingResult && (
                      <div
                        dangerouslySetInnerHTML={{
                          __html: showDiffView
                            ? diffHtml
                            : `<p>${rewritten.slice(0, typedCount)}${typingDone || staticReduce ? '' : '<span class="demo-caret"></span>'}</p>`,
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
              <div className="demo-dialog-footer">
                <span className="demo-btn-ghost">
                  {t('editor.polish.retryWithOp', { op: t('editor.polish.op.aiOptimize') })}
                </span>
                <span style={{ display: 'inline-flex', gap: 8 }}>
                  <span className="demo-btn-ghost">{t('editor.polish.discard')}</span>
                  <span className="demo-btn-primary">{t('editor.polish.accept')}</span>
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 虚拟光标：位置由 timeline 直写 transform（与选区同帧），显隐/按压走 CSS 过渡 */}
      <div ref={cursorElRef} className="demo-cursor-anchor">
        <div
          className={[
            'demo-cursor',
            cursorVisible && !staticReduce ? 'is-visible' : '',
            cursorPress ? 'is-press' : '',
          ].join(' ').trim()}
        />
      </div>
    </div>
  );
}
