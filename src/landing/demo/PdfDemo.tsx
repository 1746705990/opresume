/**
 * 落地页「PDF 导入」程序化演示：上传 → 文本提取 → AI 解析 → 预览（板块卡片弹入）。
 * 不模拟对话框浮层——流程主体直接平铺在卡片中央（无边框），到预览为止，
 * 不包含确认导入与成功提示。内容预编排（样例简历数据），文案随页面语言切换。
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Briefcase,
  Check,
  FileText,
  GraduationCap,
  Loader2,
  Sparkles,
  Upload,
  User,
  Wrench,
} from 'lucide-react';
import { getSampleResume } from '@/config/sample-resume';
import { sleep, useDemoLang, useDemoLoop, useInView } from './playback';

type Stage = 'upload' | 'extracting' | 'calling' | 'preview';
const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function PdfDemo() {
  const lang = useDemoLang();
  const { t } = useTranslation();
  const [rootRef, inView] = useInView<HTMLDivElement>();

  const [stage, setStage] = useState<Stage>('upload');
  const [stepDone, setStepDone] = useState(0); // 0=进行中 1=提取完成 2=两步完成

  const data = useMemo(() => {
    const s = getSampleResume(lang);
    const basics = s.basics ?? {};
    const city =
      (s['x-op-customFields'] as Array<{ key: string; value: string }> | undefined)?.[0]?.value ?? '';
    const work = s.work?.[0];
    const endDate = work?.endDate ?? '';
    // 日期区间：空 endDate 视为在职中，显示「至今/Present」（与产品语义一致）
    const endText = endDate
      ? /^present$|^至今$/i.test(endDate)
        ? t('field.present')
        : endDate
      : t('field.present');
    return {
      name: basics.name ?? '',
      label: basics.label ?? '',
      email: basics.email ?? '',
      phone: basics.phone ?? '',
      city,
      work,
      workDate: [work?.startDate, endText].filter(Boolean).join(' – '),
      education: s.education?.[0],
      skills: (s.skills ?? []).slice(0, 4).map((sk) => sk.name),
    };
  }, [lang, t]);

  useDemoLoop(inView, async (check) => {
    // 复位
    setStage('upload');
    setStepDone(0);
    await sleep(1700, check);
    if (check()) return;

    // 阶段一：提取 PDF 文本
    setStage('extracting');
    await sleep(1600, check);
    if (check()) return;
    setStepDone(1);
    await sleep(0, check);
    if (check()) return;

    // 阶段二：AI 解析
    setStage('calling');
    await sleep(1600, check);
    if (check()) return;
    setStepDone(2);
    await sleep(100, check);
    if (check()) return;

    // 预览：板块卡片依次弹入，停留后进入下一轮
    setStage('preview');
    await sleep(3200, check);
  }, lang);

  const steps = [
    {
      done: stepDone >= 1,
      active: stage === 'extracting',
      label: stepDone >= 1 ? t('importPDF.stepExtractDone') : stage === 'extracting' ? t('importPDF.stepExtractActive') : t('importPDF.stepExtractPending'),
      hint: false,
    },
    {
      done: stepDone >= 2,
      active: stage === 'calling',
      label: stepDone >= 2 ? t('importPDF.stepAIDone') : stage === 'calling' ? t('importPDF.stepAIActive') : t('importPDF.stepAIPending'),
      hint: stage === 'calling',
    },
  ];

  const sectionAnim = {
    initial: { opacity: 0, y: 10, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { duration: 0.28, ease: EASE_OUT },
  };

  return (
    <div ref={rootRef} className="demo-root demo-pdf" aria-hidden="true">
      <div className="demo-pdf-flow">
        <div className="demo-pdf-flow-header">
          <Sparkles />
          {t('importPDF.title')}
        </div>

        <div className="demo-pdf-body">
          <AnimatePresence mode="wait">
            {stage === 'upload' && (
              <motion.div
                key="upload"
                className="demo-upload-zone"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.18 } }}
                transition={{ duration: 0.22 }}
              >
                <span className="demo-upload-icon">
                  <Upload />
                </span>
                <p className="demo-upload-hint">{t('importPDF.dropHint')}</p>
                <p className="demo-upload-format">{t('importPDF.formatHint')}</p>
              </motion.div>
            )}

            {(stage === 'extracting' || stage === 'calling') && (
              <motion.div
                key="progress"
                className="demo-pdf-progress"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.18 } }}
                transition={{ duration: 0.22 }}
              >
                <div className="demo-file-chip">
                  <FileText />
                  <span>resume.pdf</span>
                </div>
                <div className="demo-steps">
                  {steps.map((s, i) => (
                    <div key={i}>
                      <div className={s.active ? 'demo-step is-active' : 'demo-step'}>
                        <span className="demo-step-icon">
                          {s.done ? (
                            <span className="demo-step-check">
                              <Check />
                            </span>
                          ) : s.active ? (
                            <Loader2 className="demo-spinner" />
                          ) : (
                            <span className="demo-step-dot" />
                          )}
                        </span>
                        <span className="demo-step-label">{s.label}</span>
                      </div>
                      {s.hint && <p className="demo-step-hint">{t('importPDF.stepAIHint')}</p>}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {stage === 'preview' && (
              <motion.div
                key="preview"
                className="demo-preview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.18 } }}
                transition={{ duration: 0.22 }}
              >
                <motion.div className="demo-preview-card" {...sectionAnim} transition={{ ...sectionAnim.transition, delay: 0 }}>
                  <div className="demo-preview-head">
                    <User />
                    <span>{t('module.profile')}</span>
                  </div>
                  <p className="demo-preview-name">{data.name}</p>
                  <p className="demo-preview-sub">{data.label}</p>
                  <div className="demo-preview-meta">
                    {data.email && <span>{data.email}</span>}
                    {data.phone && <span>{data.phone}</span>}
                    {data.city && <span>{data.city}</span>}
                  </div>
                </motion.div>

                <motion.div className="demo-preview-card" {...sectionAnim} transition={{ ...sectionAnim.transition, delay: 0.14 }}>
                  <div className="demo-preview-head">
                    <Briefcase />
                    <span>{t('module.workExpList')}</span>
                    <em className="demo-preview-count">1</em>
                  </div>
                  <p className="demo-preview-strong">{data.work?.name}</p>
                  <p className="demo-preview-sub">
                    {[data.work?.position, data.workDate].filter(Boolean).join(' · ')}
                  </p>
                </motion.div>

                <motion.div className="demo-preview-card" {...sectionAnim} transition={{ ...sectionAnim.transition, delay: 0.28 }}>
                  <div className="demo-preview-head">
                    <GraduationCap />
                    <span>{t('module.educationList')}</span>
                    <em className="demo-preview-count">1</em>
                  </div>
                  <p className="demo-preview-strong">{data.education?.institution}</p>
                  <p className="demo-preview-sub">
                    {[data.education?.area, data.education?.studyType].filter(Boolean).join(' · ')}
                  </p>
                </motion.div>

                <motion.div className="demo-preview-card" {...sectionAnim} transition={{ ...sectionAnim.transition, delay: 0.42 }}>
                  <div className="demo-preview-head">
                    <Wrench />
                    <span>{t('module.skillList')}</span>
                  </div>
                  <div className="demo-skill-tags">
                    {data.skills.map((name) => (
                      <span key={name} className="demo-skill-tag">
                        {name}
                      </span>
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
