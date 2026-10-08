import { motion } from 'framer-motion';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { useLanguage } from '../i18n';

const brands = [
  { name: 'Vogue', text: 'VOGUE' },
  { name: 'GQ', text: 'GQ' },
  { name: 'Elle', text: 'ELLE' },
  { name: 'Harper\'s Bazaar', text: 'BAZAAR' },
  { name: 'Esquire', text: 'ESQUIRE' },
  { name: 'Hypebeast', text: 'HYPEBEAST' },
];

export default function SocialProof() {
  const { ref, inView } = useScrollReveal(0.2);
  const { t } = useLanguage();

  return (
    <section ref={ref} className="py-16 sm:py-20 bg-white border-y border-moon-face-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center text-xs font-semibold text-charcoal-400 uppercase tracking-[0.25em] mb-10"
        >
          {t('featuredIn')}
        </motion.p>
        <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 lg:gap-16">
          {brands.map((brand, i) => (
            <motion.div
              key={brand.name}
              initial={{ opacity: 0, y: 15 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group cursor-default"
            >
              <span className="text-xl sm:text-2xl font-black tracking-[0.15em] text-charcoal-200 group-hover:text-charcoal-400 transition-colors duration-500">
                {brand.text}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
