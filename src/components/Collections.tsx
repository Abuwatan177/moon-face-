import { motion } from 'framer-motion';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { ArrowUpRight } from 'lucide-react';
import type { SiteContent } from '../data/siteContent';
import { useLanguage } from '../i18n';
import StoredMedia from './StoredMedia';

export default function Collections({ collections = [], onSelectCollection }: { collections?: SiteContent['collections']; onSelectCollection?: (title: string) => void }) {
  const { ref, inView } = useScrollReveal(0.1);
  const { language, t } = useLanguage();

  return (
    <section id="collections" ref={ref} dir={language === 'en' ? 'ltr' : 'rtl'} className="py-20 sm:py-28 bg-transparent relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-12">
          <div>
            <motion.span
              initial={{ opacity: 0, y: 10 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              className="inline-block text-xs font-semibold text-moon-face-600 uppercase tracking-[0.25em] mb-3"
            >
              {t('collections')}
            </motion.span>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.1 }}
              className="text-3xl sm:text-4xl font-extrabold text-charcoal-900 tracking-tight"
            >
              {t('browseWorld')}
            </motion.h2>
          </div>
        </div>

        {/* Collection Cards */}
        <div className="grid md:grid-cols-3 gap-5 lg:gap-7">
          {collections.map((col, i) => (
            <motion.a
              key={col.title}
              href="#products"
              onClick={(event) => { event.preventDefault(); onSelectCollection?.(col.title); }}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2 + i * 0.15 }}
              className="group relative aspect-[3/4] rounded-3xl overflow-hidden cursor-pointer shadow-lg"
            >
              <StoredMedia type="image" source={col.image} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl opacity-70" />
              <StoredMedia type="image" source={col.image} alt={`${col.title} ${t('collections')}`} className="absolute inset-0 h-full w-full object-contain" />

              {/* طبقة تظليل ممتدة للكرت كاملاً لحماية النصوص البيضاء */}
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal-950/90 via-transparent to-black/60 transition-opacity duration-300" />

              {/* ============================================================== */}
              {/* الحاوية العلوية: تم تحويل كافة ألوان النصوص الفرعية إلى الأبيض الناصع */}
              {/* ============================================================== */}
              <div className={`absolute top-0 inset-x-0 p-6 flex flex-col gap-1 ${language === 'en' ? 'text-left' : 'text-right'}`}>
                {/* المقاسات باللون الأبيض */}
                <span className="text-[11px] font-bold text-white uppercase tracking-widest opacity-90">
                  {col.items}
                </span>

                {/* الاسم العربي والوصف باللون الأبيض ومحاذاة لليمين */}
                <div className={language === 'en' ? 'text-left' : 'text-right'} dir={language === 'en' ? 'ltr' : 'rtl'}>
                  <span className="text-sm text-white font-arabic font-bold drop-shadow-sm">
                    {language === 'ar' ? col.titleAr : col.title}
                  </span>
                  <p className="text-xs text-white/90 mt-1 font-medium drop-shadow-sm">
                    {language === 'ar' ? col.subtitle : t('collectionPiece')}
                  </p>
                </div>

                {/* زر Explore الحركي باللون الأبيض المستقر */}
                <div className="flex items-center gap-1.5 text-white group-hover:text-moon-face-300 transition-colors mt-3 w-fit">
                  <span className="text-[11px] font-bold uppercase tracking-wider">{t('exploreCollection')}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300" />
                </div>
              </div>

              {/* ============================================================== */}
              {/* الحاوية السفلية: الاسم الإنجليزي باللون الأبيض الثابت */}
              {/* ============================================================== */}
              <div className="absolute bottom-0 inset-x-0 p-6 sm:p-8 flex flex-col justify-end">
                <h3 className="text-3xl sm:text-4xl font-extrabold text-white tracking-wide drop-shadow-md">
                  {col.title}
                </h3>
              </div>

              {/* Hover border glow */}
              <div className="absolute inset-0 border-2 border-transparent group-hover:border-moon-face-400/30 rounded-3xl transition-colors duration-500" />
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}