/**
 * 落地页「一键打码」程序化演示：复刻编辑器隐私模式——顶部工具栏含隐私按钮
 * （与简历画布分离，符合实际布局），光标点击后所有敏感字段同帧打码/还原
 * （与产品 togglePrivacy 的即时全量切换一致，maskField 与产品同源）。
 * 内容预编排（样例简历 basics/work/education/skills），文案随页面语言切换。
 */
import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Mail, MapPin, Phone } from 'lucide-react';
import { getSampleResume } from '@/config/sample-resume';
import { maskField } from '@/utils/privacy';
import { extractText } from '@/utils/text-diff';
import { animate, sleep, useDemoLang, useDemoLoop, useInView } from './playback';

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** 提取 x-op-workDescHtml 里的全部 li 纯文本 */
function readDescHtml(item: unknown): string {
  return (item as Record<string, unknown> | null)?.['x-op-workDescHtml'] as string | undefined ?? '';
}

export default function PrivacyDemo() {
  const lang = useDemoLang();
  const { t } = useTranslation();
  const [rootRef, inView] = useInView<HTMLDivElement>();
  const btnRef = useRef<HTMLSpanElement>(null);

  const [privacyOn, setPrivacyOn] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(false);
  const [cursorPress, setCursorPress] = useState(false);
  const cursorElRef = useRef<HTMLDivElement>(null);
  const cursorPosRef = useRef({ x: -100, y: -100 });

  const info = useMemo(() => {
    const s = getSampleResume(lang);
    const basics = s.basics ?? {};
    const city =
      (s['x-op-customFields'] as Array<{ key: string; value: string }> | undefined)?.[0]?.value ?? '';
    const work = s.work ?? [];
    // 单公司多条描述：取第一条工作经历的前两段 li
    const descLis = [...readDescHtml(work[0]).matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)]
      .slice(0, 2)
      .map((m) => extractText(m[1]).trim())
      .filter(Boolean);
    return {
      name: basics.name ?? '',
      label: basics.label ?? '',
      phone: basics.phone ?? '',
      email: basics.email ?? '',
      city,
      company1: work[0]?.name ?? '',
      descLis,
      work1: work[0],
    };
  }, [lang]);

  /** 隐私开启时按产品同源规则打码（所有字段同步切换，无逐个延迟） */
  const shown = (key: 'name' | 'mobile' | 'email' | 'companyName', value: string) =>
    privacyOn ? maskField(value, key) : value;

  const fade = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.16, ease: EASE_OUT },
  };

  // 光标位置直写 transform（帧级同步），显隐/按压走 CSS 过渡
  const setCursorAt = (x: number, y: number, visible = true) => {
    cursorPosRef.current = { x, y };
    if (cursorElRef.current) {
      cursorElRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
    setCursorVisible(visible);
  };

  /** 离散移动：从当前位置滑到按钮（A→B 过程可见） */
  const glideCursorToButton = async (check: () => boolean) => {
    const rootRect = rootRef.current?.getBoundingClientRect();
    const btnRect = btnRef.current?.getBoundingClientRect();
    if (!rootRect || !btnRect) return;
    const to = {
      x: btnRect.left - rootRect.left + btnRect.width / 2,
      y: btnRect.top - rootRect.top + btnRect.height / 2,
    };
    const from = { ...cursorPosRef.current };
    await animate(480, (p) => {
      const e = 1 - (1 - p) ** 3;
      setCursorAt(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
    }, check);
  };

  useDemoLoop(inView, async (check) => {
    // 复位
    setPrivacyOn(false);
    setCursorVisible(false);
    await sleep(1000, check);
    if (check()) return;

    // 光标滑到顶部工具栏的「隐私模式」按钮并点击 → 全部敏感信息同帧打码
    await glideCursorToButton(check);
    if (check()) return;
    await sleep(300, check);
    if (check()) return;
    setCursorPress(true);
    await sleep(170, check);
    if (check()) return;
    setCursorPress(false);
    setPrivacyOn(true);
    setCursorVisible(false);
    await sleep(2600, check);
    if (check()) return;

    // 再点一次还原
    await glideCursorToButton(check);
    if (check()) return;
    await sleep(300, check);
    if (check()) return;
    setCursorPress(true);
    await sleep(170, check);
    if (check()) return;
    setCursorPress(false);
    setPrivacyOn(false);
    setCursorVisible(false);
    await sleep(1300, check);
  }, lang);

  return (
    <div ref={rootRef} className="demo-root demo-privacy" aria-hidden="true">
      {/* 编辑器顶栏：隐私按钮在简历画布外，与实际布局一致 */}
      <div className="demo-editor-chrome">
        <span className="demo-chrome-brand">{t('app.fullName')}</span>
        <span ref={btnRef} className={privacyOn ? 'demo-privacy-btn is-on' : 'demo-privacy-btn'}>
          <span className="demo-privacy-btn-icon">{privacyOn ? <EyeOff /> : <Eye />}</span>
          {t('toolbar.privacyMode')}
        </span>
      </div>

      {/* 简历画布 */}
      <div className="demo-canvas">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={shown('name', info.name)} className="demo-pv-name" {...fade}>
            {shown('name', info.name)}
          </motion.span>
        </AnimatePresence>
        <div className="demo-pv-label">{info.label}</div>

        <div className="demo-pv-contacts">
          <span>
            <Phone />
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={shown('mobile', info.phone)} {...fade}>
                {shown('mobile', info.phone)}
              </motion.span>
            </AnimatePresence>
          </span>
          <span>
            <Mail />
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={shown('email', info.email)} {...fade}>
                {shown('email', info.email)}
              </motion.span>
            </AnimatePresence>
          </span>
          <span>
            <MapPin />
            {info.city}
          </span>
        </div>

        <div className="demo-module-title">{t('module.workExpList')}</div>
        <div className="demo-work-item">
          <div className="demo-work-head">
            <span className="demo-work-company">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={shown('companyName', info.company1)} {...fade} style={{ display: 'inline-block' }}>
                  {shown('companyName', info.company1)}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className="demo-work-date">{dateOf(info.work1, t('field.present'))}</span>
          </div>
          <ul className="demo-work-desc">
            {info.descLis.map((li, i) => (
              <li key={i}>{li}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* 虚拟光标：位置由 timeline 直写 transform（帧级同步），显隐/按压走 CSS 过渡 */}
      <div ref={cursorElRef} className="demo-cursor-anchor">
        <div
          className={[
            'demo-cursor',
            cursorVisible ? 'is-visible' : '',
            cursorPress ? 'is-press' : '',
          ].join(' ').trim()}
        />
      </div>
    </div>
  );
}

/** 工作经历日期区间：空 endDate 视为在职中显示「至今」，present 归一为本地化文案 */
function dateOf(work: unknown, presentText: string): string {
  const w = work as Record<string, unknown> | null;
  const start = (w?.startDate as string | undefined) ?? '';
  const end = (w?.endDate as string | undefined) ?? '';
  const endText = end ? (/^present$|^至今$/i.test(end) ? presentText : end) : presentText;
  return [start, endText].filter(Boolean).join(' - ');
}
