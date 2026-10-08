import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { useScrollReveal } from '../hooks/useScrollReveal';
import type { SiteContent } from '../data/siteContent';
import { useLanguage } from '../i18n';

export default function Features({ content }: { content: SiteContent['story'] }) {
  const { ref, inView } = useScrollReveal(0.05);
  const { language, t } = useLanguage();
  const featureTitleKeys = ['featureTitle1', 'featureTitle2', 'featureTitle3'];
  const featureDescriptionKeys = ['featureDescription1', 'featureDescription2', 'featureDescription3'];
  if (!Object.values(content).some((value) => typeof value === 'string' ? value.trim() : value.length > 0)) return null;

  return (
    <section id="about" ref={ref} dir={language === 'en' ? 'ltr' : 'rtl'} className="relative overflow-hidden bg-transparent py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
        <div className={`mx-auto max-w-3xl ${language === 'en' ? 'text-left' : 'text-right'}`}>
            <motion.span 
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              className="text-lg font-bold text-[#68704B] sm:text-xl"
            >
            {language === 'ar' ? content.eyebrow : t('storyEyebrow')}
            </motion.span>
            
      <motion.h2 
  initial={{ opacity: 0, y: 20 }}
  animate={inView ? { opacity: 1, y: 0 } : {}}
  transition={{ delay: 0.1 }}
  className="mt-3 mb-4 text-3xl font-extrabold leading-tight text-[#4E563C] sm:text-4xl"
>
  {language === 'ar' ? content.title : t('storyTitle')} <br />
  <span className="text-[#68704B]">{language === 'ar' ? content.highlight : t('storyHighlight')}</span>
</motion.h2>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ delay: 0.2 }}
              className="mb-6 text-base leading-8 text-[#414235] sm:text-lg sm:leading-9"
            >
              {language === 'ar' ? content.description : t('storyDescription')}
            </motion.p>

            <div className="grid gap-x-8 gap-y-6 md:grid-cols-3">
              {content.features.map((feat, index) => (
                <motion.div 
                  key={`${feat.title}-${index}`}
                  initial={{ opacity: 0, x: -30 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: index * 0.1 + 0.3 }}
                  className="flex items-start gap-3 border-t border-[#c6c9b2] pt-4"
                >
                  <ArrowUpRight className="mt-1 size-5 shrink-0 text-[#68704B]" aria-hidden="true" />
                  <div>
                    <h3 className="mb-1 text-lg font-bold text-[#4E563C] sm:text-xl">{language === 'ar' ? feat.title : t(featureTitleKeys[index] || 'featureTitle1')}</h3>
                    <p className="text-sm leading-7 text-[#414235] sm:text-base">
                      {language === 'ar' ? feat.description : t(featureDescriptionKeys[index] || 'featureDescription1')}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

        </div>
      </div>
    </section>
  );
}