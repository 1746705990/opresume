/**
 * 落地页「自由拖拽」程序化演示：复刻编辑器抽屉的大模块拖拽排序。
 * DOM 结构与样式逐类对照真实 EditorHeader / DragOverlayContent 的 Tailwind
 * 类名精确换算（gap-1 / px-3 / py-3 / h-6 w-6 / [&_svg]:size-4 / rounded-lg /
 * bg-editor-module 等），保证与实际编辑器观感一致。
 * 被拖模块显示 DragOverlay 浮动卡片（grip+图标+标题，跟随光标），
 * 原位保持，其余模块实时让位（数组换序），不引入 @dnd-kit。
 */
import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Award, Briefcase, ChevronDown, Eye, GraduationCap, GripVertical, Pencil, Wrench } from 'lucide-react';
import { animate, sleep, useDemoLang, useDemoLoop, useInView } from './playback';

const CARD_PITCH = 56; // 模块头高度（48，由标题按钮 py-3 撑出）+ 间距 8（CSS 同步）
const GRIP_X = 24; // 拖拽把手中心 x（px-3 12 + 按钮 24/2）
const FIRST_CARD_CY = 38; // 第一张模块头中心 y（drawer padding 14 + 24）
const OVERLAY_ANCHOR = 24; // 光标到 overlay 顶部的锚定偏移（overlay 内把手按钮中心）
const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
const ORIGINAL_ORDER = ['m0', 'm1', 'm2', 'm3'];

export default function DragDemo() {
  const lang = useDemoLang();
  const { t } = useTranslation();
  const [rootRef, inView] = useInView<HTMLDivElement>();

  const [items, setItems] = useState<string[]>(ORIGINAL_ORDER);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overlayY, setOverlayY] = useState(0);
  const [cursorVisible, setCursorVisible] = useState(false);
  const [cursorPress, setCursorPress] = useState(false);
  const cursorElRef = useRef<HTMLDivElement>(null);
  const cursorPosRef = useRef({ x: -100, y: -100 });
  const swapRef = useRef(false);

  const modules = useMemo(
    () => [
      { id: 'm0', title: t('module.workExpList'), Icon: Briefcase },
      { id: 'm1', title: t('module.educationList'), Icon: GraduationCap },
      { id: 'm2', title: t('module.awardList'), Icon: Award },
      { id: 'm3', title: t('module.skillList'), Icon: Wrench },
    ],
    [lang],
  );
  const moduleOf = (id: string) => modules.find((m) => m.id === id) ?? modules[0];

  // 光标位置直写 transform（帧级同步），显隐/按压走 CSS 过渡
  const setCursorAt = (x: number, y: number, visible = true) => {
    cursorPosRef.current = { x, y };
    if (cursorElRef.current) {
      cursorElRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
    setCursorVisible(visible);
  };

  /** 离散移动：从当前位置滑到目标（A→B 过程可见） */
  const glideCursorTo = async (x: number, y: number, ms: number, check: () => boolean) => {
    const from = { ...cursorPosRef.current };
    await animate(ms, (p) => {
      const e = 1 - (1 - p) ** 3;
      setCursorAt(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    }, check);
  };

  useDemoLoop(
    inView,
    async (check) => {
      // 每轮把第一格模块拖到第二格，随后顺序演化，下一轮继续——形成持续重排的循环
      const [firstId, secondId] = items;
      if (!firstId || !secondId) return;
      swapRef.current = false;
      await sleep(600, check);
      if (check()) return;

      // 光标滑到第一格把手（循环轮次已在位则直接归位）
      const dist = Math.hypot(cursorPosRef.current.x - GRIP_X, cursorPosRef.current.y - FIRST_CARD_CY);
      if (dist > 2) {
        await glideCursorTo(GRIP_X, FIRST_CARD_CY, 520, check);
        if (check()) return;
      } else {
        setCursorAt(GRIP_X, FIRST_CARD_CY);
      }

      // 按下并「抓住」：DragOverlay 浮动卡片出现（跟随光标），原模块头浅色显示（未确定位置）
      setCursorPress(true);
      setDragId(firstId);
      setOverlayY(FIRST_CARD_CY - OVERLAY_ANCHOR);
      await sleep(460, check);
      if (check()) return;

      // 连续拖动一格（线性匀速，越过中线触发其余模块让位），无中途停顿
      const dragDone = await animate(
        1000,
        (p) => {
          const y = p * CARD_PITCH;
          if (!swapRef.current && p > 0.55) {
            swapRef.current = true;
            setItems([secondId, firstId, ...items.slice(2)]);
          }
          const wobble = Math.sin(p * 12) * 1.0 * (1 - p);
          setCursorAt(GRIP_X + wobble, FIRST_CARD_CY + y);
          setOverlayY(FIRST_CARD_CY + y - OVERLAY_ANCHOR);
        },
        check,
      );
      if (!dragDone) return;

      // 对齐微停后松手：overlay 收回，模块落位（layout 槽位已交换，无跳变）
      await sleep(320, check);
      if (check()) return;
      setCursorPress(false);
      setDragId(null);
      await sleep(1400, check);
    },
    lang,
  );

  return (
    <div ref={rootRef} className="demo-root demo-drawer" aria-hidden="true">
      <div className="demo-drawer-list">
        {items.map((id) => {
          const m = moduleOf(id);
          const isSource = dragId === id;
          const Icon = m.Icon;
          return (
            <motion.div
              key={id}
              layout={!isSource} // 拖动中禁用 layout 补偿，overlay 位置完全由 timeline 接管
              transition={{ duration: 0.34, ease: EASE_OUT }}
              className={isSource ? 'demo-module-head is-dimmed' : 'demo-module-head'}
            >
              <span className="demo-head-stripe" />
              <span className="demo-icon-btn demo-grab">
                <GripVertical />
              </span>
              <span className="demo-icon-btn">
                <ChevronDown />
              </span>
              <span className="demo-icon-wrap">
                <Icon />
              </span>
              <span className="demo-title-btn">
                <span className="demo-title-text">{m.title}</span>
                <span className="demo-edit-pencil">
                  <Pencil />
                </span>
              </span>
              <span className="demo-icon-btn">
                <Eye />
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* DragOverlay 浮动卡片：抓取期间跟随光标（对照 DragOverlayContent） */}
      <AnimatePresence>
        {dragId && (
          <motion.div
            className="demo-drag-overlay"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1.02 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            style={{ top: overlayY }}
          >
            {(() => {
              const m = moduleOf(dragId);
              const Icon = m.Icon;
              return (
                <>
                  <span className="demo-grip">
                    <GripVertical />
                  </span>
                  <span className="demo-icon-wrap">
                    <Icon />
                  </span>
                  <span className="demo-title-text">{m.title}</span>
                </>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 虚拟光标：位置由 timeline 直写 transform（与 overlay 同帧），显隐/按压走 CSS 过渡 */}
      <div ref={cursorElRef} className="demo-cursor-anchor">
        <div
          className={[
            'demo-cursor',
            cursorVisible ? 'is-visible' : '',
            cursorPress ? 'is-press' : '',
          ]
            .join(' ')
            .trim()}
        />
      </div>
    </div>
  );
}
