import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { useLanguage } from '../i18n';

const refreshThreshold = 84;

export default function PullToRefresh() {
  const { t } = useLanguage();
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const startY = useRef<number | null>(null);
  const refreshTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!('ontouchstart' in window) && navigator.maxTouchPoints === 0) return;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || window.scrollY > 1 || refreshingRef.current) {
        startY.current = null;
        return;
      }
      const target = event.target;
      if (target instanceof Element && target.closest('aside, [role="dialog"], [class*="overflow-y-auto"], input, textarea, select, button, a, iframe, video, [data-pull-refresh-ignore]')) {
        startY.current = null;
        return;
      }
      startY.current = event.touches[0].clientY;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (startY.current === null || refreshingRef.current || event.touches.length !== 1) return;
      if (window.scrollY > 1) {
        startY.current = null;
        setPullDistance(0);
        return;
      }
      const distance = event.touches[0].clientY - startY.current;
      if (distance <= 0) {
        setPullDistance(0);
        return;
      }
      if (event.cancelable) event.preventDefault();
      const nextDistance = Math.min(distance, refreshThreshold + 24);
      setPullDistance(nextDistance);
      if (distance >= refreshThreshold) {
        refreshingRef.current = true;
        setRefreshing(true);
        startY.current = null;
        refreshTimer.current = window.setTimeout(() => window.location.reload(), 180);
      }
    };

    const resetPull = () => {
      startY.current = null;
      if (!refreshingRef.current) setPullDistance(0);
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', resetPull, { passive: true });
    window.addEventListener('touchcancel', resetPull, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', resetPull);
      window.removeEventListener('touchcancel', resetPull);
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    };
  }, []);

  const indicatorOffset = refreshing ? 12 : Math.min(12, pullDistance - 64);
  const label = refreshing
    ? t('refreshingPage')
    : pullDistance >= refreshThreshold
      ? t('releaseToRefresh')
      : t('pullToRefresh');

  return <div
    role="status"
    aria-live="polite"
    aria-label={label}
    className="fixed left-1/2 top-2 z-[110] flex items-center gap-2 rounded-full bg-[#563C2E] px-4 py-2 text-sm font-semibold text-white shadow-lg transition-[transform,opacity] duration-150"
    style={{ transform: `translate(-50%, ${indicatorOffset}px)`, opacity: pullDistance > 8 || refreshing ? 1 : 0 }}
  >
    {refreshing ? <LoaderCircle size={17} className="animate-spin" /> : <RefreshCw size={17} style={{ transform: `rotate(${pullDistance * 4}deg)` }} />}
    <span>{label}</span>
  </div>;
}