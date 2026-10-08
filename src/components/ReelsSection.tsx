import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Product } from '../data/products';
import type { SiteContent } from '../data/siteContent';
import { useLanguage } from '../i18n';
import ProductEngagement from './ProductEngagement';
import StoredMedia from './StoredMedia';

export default function ReelsSection({ entries, products, onRequireAuth }: { entries: SiteContent['reels']['entries']; products: Product[]; onRequireAuth: () => void }) {
  const { language, t } = useLanguage();
  const railRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const scrollReels = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (rail) rail.scrollBy({ left: direction * (language === 'ar' ? -1 : 1) * rail.clientWidth * 0.82, behavior: 'smooth' });
  };

  const handleVideoHover = (index: number, active: boolean) => {
    const video = videoRefs.current[index];
    if (!video) return;

    if (active) {
      video.muted = false;
      video.currentTime = 0;
      void video.play().catch(() => undefined);
      return;
    }

    video.pause();
    video.currentTime = 0;
    video.muted = true;
  };

  return (
    <section id="reels" dir={language === 'en' ? 'ltr' : 'rtl'} className="bg-transparent py-8 sm:py-10">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        <h2 className="text-3xl font-extrabold text-moon-face-900 sm:text-4xl">{t('reelsTitle')}</h2>
        {entries.length ? <>
          <div ref={railRef} className="mt-5 flex touch-pan-x snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain scroll-smooth pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {entries.map((entry, index) => {
              const product = products.find((item) => item.id === entry.productId);
              return <article key={entry.id || `${entry.url}-${index}`} className="w-[min(78vw,18rem)] shrink-0 snap-start overflow-hidden rounded-xl bg-white/70 text-[#292c23] shadow-sm">
                <StoredMedia
                  ref={(node) => {
                    videoRefs.current[index] = node;
                  }}
                  type="video"
                  source={entry.url}
                  alt={entry.caption || `${t('reelsTitle')} ${index + 1}`}
                  controls
                  muted
                  loop
                  onMouseEnter={() => handleVideoHover(index, true)}
                  onMouseLeave={() => handleVideoHover(index, false)}
                  onFocus={() => handleVideoHover(index, true)}
                  onBlur={() => handleVideoHover(index, false)}
                  className="aspect-[9/16] w-full bg-[#2E241D] object-cover"
                />
                {entry.caption.trim() && <p className="px-3 pt-3 text-sm leading-6">{entry.caption}</p>}
                {product && <div className="px-2 pb-2">
                  <p className="truncate px-2 pt-2 text-xs font-semibold text-[#68705d]">{language === 'ar' ? product.nameAr : product.name}</p>
                  <ProductEngagement product={product} onRequireAuth={onRequireAuth} showProductExtras={false} subjectLabel={entry.caption || (language === 'ar' ? product.nameAr : product.name)} />
                </div>}
              </article>;
            })}
          </div>
          {entries.length > 1 && <nav aria-label={t('reelsTitle')} dir="ltr" className="mt-2 flex justify-center gap-2">
            <button type="button" onClick={() => scrollReels(-1)} title={t('previousMedia')} aria-label={t('previousMedia')} className="grid size-10 place-items-center rounded-full border border-moon-face-300 text-moon-face-800 transition-colors hover:bg-moon-face-100"><ChevronLeft className={language === 'ar' ? 'rotate-180' : ''} size={19} /></button>
            <button type="button" onClick={() => scrollReels(1)} title={t('nextMedia')} aria-label={t('nextMedia')} className="grid size-10 place-items-center rounded-full border border-moon-face-300 text-moon-face-800 transition-colors hover:bg-moon-face-100"><ChevronRight className={language === 'ar' ? 'rotate-180' : ''} size={19} /></button>
          </nav>}
        </> : <p className="mt-5 border-y border-moon-face-200 py-7 text-sm text-charcoal-500">{t('noReels')}</p>}
      </div>
    </section>
  );
}