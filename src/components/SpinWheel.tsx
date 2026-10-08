import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, Disc3, Gift, RotateCw, Sparkles, X } from 'lucide-react';
import { claimWheelReward, loadWheelConfig, spinWheel, type WheelConfig, type WheelSpinResult } from '../lib/api';
import { useLanguage } from '../i18n';
import { useAuth } from '../context/AuthContext';

const visitorKey = 'moon-face-wheel-visitor-v1';
const seenKey = 'moon-face-wheel-seen-v1';
const resultKey = 'moon-face-wheel-result-v1';
const closedConfig: WheelConfig = { enabled: false, slices: [] };

function readVisitorId() {
  try {
    const stored = localStorage.getItem(visitorKey);
    if (stored) return stored;
    const next = crypto.randomUUID();
    localStorage.setItem(visitorKey, next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}

function readSavedResult(visitorId: string) {
  try {
    const saved = localStorage.getItem(resultKey);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as { visitorId?: string; result?: WheelSpinResult };
    return parsed.visitorId === visitorId ? parsed.result || null : null;
  } catch {
    return null;
  }
}

function makeWheelBackground(config: WheelConfig) {
  let previous = 0;
  const stops = config.slices.map((slice) => {
    const start = previous;
    previous += slice.probability;
    return `${slice.color} ${start}% ${previous}%`;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

function sliceCenter(config: WheelConfig, sliceId: string) {
  let previous = 0;
  for (const slice of config.slices) {
    const center = previous + slice.probability / 2;
    if (slice.id === sliceId) return center * 3.6;
    previous += slice.probability;
  }
  return 0;
}

export default function SpinWheel() {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const [visitorId] = useState(readVisitorId);
  const [config, setConfig] = useState<WheelConfig>(closedConfig);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<WheelSpinResult | null>(() => readSavedResult(visitorId));
  const [claimedPoints, setClaimedPoints] = useState(0);
  const [codeCopied, setCodeCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const refreshConfig = () => {
      void loadWheelConfig().then((next) => {
        if (active) {
          setConfig(next);
          setLoaded(true);
        }
      }).catch(() => { if (active) setLoaded(true); });
    };
    refreshConfig();
    window.addEventListener('moon-face:wheel-config-updated', refreshConfig);
    return () => {
      active = false;
      window.removeEventListener('moon-face:wheel-config-updated', refreshConfig);
    };
  }, []);

  useEffect(() => {
    if (!loaded || !config.enabled) return;
    const hasSeen = (() => { try { return localStorage.getItem(seenKey) === 'true'; } catch { return true; } })();
    if (hasSeen) return;
    const timer = window.setTimeout(() => {
      setOpen(true);
      try { localStorage.setItem(seenKey, 'true'); } catch { /* Browser storage may be unavailable. */ }
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [loaded, config.enabled]);

  useEffect(() => {
    if (!user) return;
    void claimWheelReward(visitorId).then((points) => {
      if (points > 0) setClaimedPoints(points);
    }).catch(() => undefined);
  }, [visitorId, user?.id]);

  const close = () => {
    setOpen(false);
    try { localStorage.setItem(seenKey, 'true'); } catch { /* Browser storage may be unavailable. */ }
  };

  const storeResult = (next: WheelSpinResult) => {
    setResult(next);
    try {
      localStorage.setItem(resultKey, JSON.stringify({ visitorId, result: next }));
      localStorage.setItem(seenKey, 'true');
    } catch { /* The result remains available in this view. */ }
  };

  const startSpin = async () => {
    if (spinning || result) return;
    setSpinning(true);
    setError('');
    try {
      const next = await spinWheel(visitorId);
      if (next.alreadySpun) {
        storeResult(next);
        return;
      }
      const center = sliceCenter(config, next.prize.id);
      setRotation((current) => {
        const currentAngle = ((current % 360) + 360) % 360;
        const targetAngle = (360 - center) % 360;
        const turn = (targetAngle - currentAngle + 360) % 360;
        return current + 5 * 360 + turn;
      });
      await new Promise((resolve) => window.setTimeout(resolve, 4200));
      storeResult(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('wheelError'));
    } finally {
      setSpinning(false);
    }
  };

  const copyRewardCode = async () => {
    if (!result?.rewardCode) return;
    try {
      await navigator.clipboard.writeText(result.rewardCode);
      setCodeCopied(true);
    } catch {
      setError(t('wheelCopyFailed'));
    }
  };

  if (!loaded || !config.enabled || config.slices.length < 2) return null;

  const wheelBackground = makeWheelBackground(config);
  const wheelTitle = result?.prize.rewardType === 'points'
    ? `${result.prize.label} · ${t('wheelPointsWon')}`
    : result?.prize.rewardType === 'discount'
      ? `${result.prize.label} · ${t('wheelDiscountWon')}`
      : result?.prize.label;

  return <>
    <button type="button" onClick={() => { try { localStorage.setItem(seenKey, 'true'); } catch { /* Browser storage may be unavailable. */ } setOpen(true); }} aria-label={t('openWheel')} title={t('openWheel')} className="fixed bottom-24 right-5 z-40 grid size-12 place-items-center rounded-full bg-[#a56c4f] text-white shadow-xl transition-transform hover:scale-105">
      <Disc3 size={22} />
    </button>
    <AnimatePresence>
      {open && <div className="fixed inset-0 z-[75] grid place-items-center overflow-y-auto bg-black/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !spinning) close(); }}>
        <motion.section role="dialog" aria-modal="true" aria-labelledby="spin-wheel-title" dir={language === 'en' ? 'ltr' : 'rtl'} initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.96 }} className="relative my-auto w-full max-w-md rounded-2xl bg-[#f6f3e8] p-5 text-[#4E563C] shadow-2xl sm:p-7">
          <button type="button" onClick={close} aria-label={t('close')} className="absolute left-4 top-4 grid size-9 place-items-center rounded-full hover:bg-[#e8e7da]"><X size={18} /></button>
          <div className="mb-5 text-center"><Sparkles size={22} className="mx-auto mb-2 text-[#a56c4f]" /><h2 id="spin-wheel-title" className="text-xl font-bold">{t('spinWheelTitle')}</h2><p className="mt-1 text-sm text-[#737865]">{t('spinWheelHint')}</p></div>
          <div className="relative mx-auto mb-5 size-[min(76vw,20rem)] max-h-[20rem] max-w-[20rem]">
            <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 border-x-[12px] border-t-[22px] border-x-transparent border-t-[#4E563C]" />
            <div className="absolute inset-0 rounded-full border-[7px] border-[#4E563C] shadow-lg" style={{ background: wheelBackground, transform: `rotate(${rotation}deg)`, transition: 'transform 4.2s cubic-bezier(0.12, 0.72, 0.08, 1)' }}>
              {config.slices.map((slice) => {
                const angle = sliceCenter(config, slice.id) * Math.PI / 180;
                const x = 50 + Math.sin(angle) * 30;
                const y = 50 - Math.cos(angle) * 30;
                const labelWidth = Math.max(16, Math.min(34, slice.probability * 1.35));
                return <span key={slice.id} title={slice.label} className="absolute z-[1] -translate-x-1/2 -translate-y-1/2 rounded bg-[#f6f3e8]/90 px-1 py-0.5 text-center text-[9px] font-extrabold leading-tight text-[#4E563C] shadow-sm sm:text-xs" style={{ left: `${x}%`, top: `${y}%`, width: `${labelWidth}%` }}>{slice.label}</span>;
              })}
              <div className="absolute left-1/2 top-1/2 z-10 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-[#f6f3e8] bg-[#4E563C] text-white shadow"><Gift size={18} /></div>
            </div>
          </div>
          {result ? <div className="rounded-xl border border-[#d3d4bf] bg-white p-4 text-center" role="status">
            <p className="font-bold">{t('wheelResult')}: {wheelTitle}</p>
            {result.rewardCode && <><p className="mt-2 text-sm">{t('wheelRewardCode')}</p><div className="mt-1 flex items-center gap-2" dir="ltr"><code className="min-w-0 flex-1 select-all break-all rounded bg-[#f5f4ed] px-3 py-2 font-mono text-lg font-bold tracking-wider">{result.rewardCode}</code><button type="button" onClick={() => void copyRewardCode()} aria-label={codeCopied ? t('wheelCodeCopied') : t('wheelCopyCode')} title={codeCopied ? t('wheelCodeCopied') : t('wheelCopyCode')} className="grid size-10 shrink-0 place-items-center rounded-lg border border-[#d3d4bf] bg-white"><span className="sr-only">{codeCopied ? t('wheelCodeCopied') : t('wheelCopyCode')}</span>{codeCopied ? <Check size={17} /> : <Copy size={17} />}</button></div>{codeCopied && <p className="mt-1 text-xs text-green-700" role="status">{t('wheelCodeCopied')}</p>}</>}
            {claimedPoints > 0 && <p className="mt-2 text-sm font-semibold text-green-800">{t('wheelPointsClaimed')}: {claimedPoints}</p>}
          </div> : <button type="button" onClick={() => void startSpin()} disabled={spinning} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#4E563C] py-3 font-bold text-white disabled:opacity-60">
            <RotateCw size={17} className={spinning ? 'animate-spin' : ''} />{spinning ? t('wheelSpinning') : t('spinNow')}
          </button>}
          {error && <p role="alert" className="mt-3 text-center text-sm text-red-700">{error}</p>}
        </motion.section>
      </div>}
    </AnimatePresence>
  </>;
}