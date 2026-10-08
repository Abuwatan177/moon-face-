import { useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { defaultSiteContent, type SiteContent } from '../data/siteContent';
import { useLanguage } from '../i18n';
import StoredMedia from './StoredMedia';

export default function TutorialsSection({ content = defaultSiteContent.tutorials }: { content?: SiteContent['tutorials'] }) {
  const { ref, inView } = useScrollReveal(0.05);
  const { language, t } = useLanguage();
  const mediaRailRef = useRef<HTMLDivElement | null>(null);
  const scrollMedia = (direction: -1 | 1) => {
    const rail = mediaRailRef.current;
    if (rail) rail.scrollBy({ left: direction * (language === 'ar' ? -1 : 1) * rail.clientWidth * 0.86, behavior: 'smooth' });
  };

  return (
    <section id="tutorials" ref={ref} dir={language === 'en' ? 'ltr' : 'rtl'} className="bg-transparent py-5 sm:py-7">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        <header className="max-w-3xl">
          <h2 className="text-3xl font-extrabold text-moon-face-900 sm:text-4xl">
            {language === 'ar' ? content.title || t('tutorialsTitle') : t('tutorialsTitle')}
          </h2>
        </header>
        {content.entries.length ? <>
          <div ref={mediaRailRef} className="mt-6 flex touch-pan-x overscroll-x-contain snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2 sm:mt-8">
          {content.entries.map((entry, index) => <motion.article key={`${entry.url}-${index}`} initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ delay: Math.min(index * 0.08, 0.32) }} className="w-full shrink-0 snap-center scroll-mt-28">
            <div className="overflow-hidden rounded-lg bg-moon-face-100">
              <StoredMedia type={entry.type} source={entry.url} alt={`${t('tutorialsTitle')} ${index + 1}`} controls={entry.type === 'video'} className="aspect-[4/3] w-full object-cover sm:aspect-[16/9]" />
            </div>
            {(entry.title.trim() || entry.description.trim()) && <div className="mt-4 max-w-3xl border-s-2 border-earth-clay ps-4">
              <span className="text-xs font-bold text-earth-clay">{String(index + 1).padStart(2, '0')}</span>
              {entry.title.trim() && <h3 className="mt-1 text-lg font-bold text-moon-face-900">{entry.title}</h3>}
              {entry.description.trim() && <p className="mt-1 whitespace-pre-line text-base leading-8 text-charcoal-700 sm:text-lg">{entry.description}</p>}
            </div>}
          </motion.article>)}
          </div>
          {content.entries.length > 1 && <nav aria-label={t('tutorialsTitle')} dir="ltr" className="mt-2 flex justify-center gap-2">
            <button type="button" onClick={() => scrollMedia(-1)} title={t('previousMedia')} aria-label={t('previousMedia')} className="grid size-10 place-items-center rounded-full border border-moon-face-300 text-moon-face-800 transition-colors hover:bg-moon-face-100"><ChevronLeft className={language === 'ar' ? 'rotate-180' : ''} size={19} /></button>
            <button type="button" onClick={() => scrollMedia(1)} title={t('nextMedia')} aria-label={t('nextMedia')} className="grid size-10 place-items-center rounded-full border border-moon-face-300 text-moon-face-800 transition-colors hover:bg-moon-face-100"><ChevronRight className={language === 'ar' ? 'rotate-180' : ''} size={19} /></button>
          </nav>}
        </> : <p className="mt-8 border-y border-moon-face-200 py-8 text-sm text-charcoal-500">{t('noTutorials')}</p>}
      </div>
    </section>
  );
}