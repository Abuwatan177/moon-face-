import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ProductMedia } from '../data/products';
import StoredMedia from './StoredMedia';
import { useLanguage } from '../i18n';

export default function MediaCarousel({ items, alt, className = '', onMediaClick, fit = 'cover' }: { items: ProductMedia[]; alt: string; className?: string; onMediaClick?: () => void; fit?: 'cover' | 'contain' }) {
  const { language, t } = useLanguage();
  const media = items.filter((item) => item.url);
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => setActiveIndex((index) => Math.min(index, Math.max(0, media.length - 1))), [media.length]);

  if (!media.length) return <div className={`grid place-items-center bg-moon-face-100 text-sm text-charcoal-500 ${className}`}>{alt}</div>;
  const active = media[activeIndex];

  return <div onClick={onMediaClick} onTouchStart={(event) => { touchStartX.current = event.changedTouches[0]?.clientX ?? null; }} onTouchEnd={(event) => {
    if (touchStartX.current === null || media.length < 2) return;
    const distance = event.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(distance) > 44) setActiveIndex((index) => (index + (distance < 0 ? 1 : -1) + media.length) % media.length);
    touchStartX.current = null;
  }} className={`group/media relative touch-pan-y overflow-hidden bg-moon-face-100 ${className}`}>
    <StoredMedia type={active.type} source={active.url} alt={alt} controls={active.type === 'video'} className={`absolute inset-0 h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`} autoPlayWhenVisible={active.type === 'video'} />
    {media.length > 1 && <>
      <button type="button" onClick={(event) => { event.stopPropagation(); setActiveIndex((activeIndex - 1 + media.length) % media.length); }} className={`absolute ${language === 'en' ? 'left-2' : 'right-2'} top-1/2 z-10 grid size-12 -translate-y-1/2 place-items-center bg-transparent text-white [touch-action:manipulation] drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)] transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white`} aria-label={t('previousMedia')}><ChevronLeft className={language === 'ar' ? 'rotate-180' : ''} size={27} /></button>
      <button type="button" onClick={(event) => { event.stopPropagation(); setActiveIndex((activeIndex + 1) % media.length); }} className={`absolute ${language === 'en' ? 'right-2' : 'left-2'} top-1/2 z-10 grid size-12 -translate-y-1/2 place-items-center bg-transparent text-white [touch-action:manipulation] drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)] transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white`} aria-label={t('nextMedia')}><ChevronRight className={language === 'ar' ? 'rotate-180' : ''} size={27} /></button>
    </>}
  </div>;
}
