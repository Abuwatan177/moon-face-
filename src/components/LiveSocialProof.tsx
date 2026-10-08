import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ShoppingBag, X } from 'lucide-react';
import StoredMedia from './StoredMedia';
import type { Product } from '../data/products';
import { useLanguage } from '../i18n';

const buyers = {
  ar: [
    { buyer: 'سارة', city: 'الخليل' },
    { buyer: 'ليان', city: 'رام الله' },
    { buyer: 'نور', city: 'نابلس' },
    { buyer: 'مريم', city: 'القدس' },
    { buyer: 'جنى', city: 'بيت لحم' },
    { buyer: 'رنا', city: 'جنين' },
  ],
  en: [
    { buyer: 'Sara', city: 'Hebron' },
    { buyer: 'Layan', city: 'Ramallah' },
    { buyer: 'Noor', city: 'Nablus' },
    { buyer: 'Mariam', city: 'Jerusalem' },
    { buyer: 'Jana', city: 'Bethlehem' },
    { buyer: 'Rana', city: 'Jenin' },
  ],
};

type PurchaseNotice = { buyer: string; city: string; product: Product };

export default function LiveSocialProof({ products, paused = false }: { products: Product[]; paused?: boolean }) {
  const { language, t } = useLanguage();
  const [notice, setNotice] = useState<PurchaseNotice | null>(null);

  useEffect(() => {
    if (paused || products.length === 0) {
      setNotice(null);
      return;
    }

    let active = true;
    let firstTimer: ReturnType<typeof setTimeout>;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    let nextTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleNextNotice = () => {
      nextTimer = setTimeout(showNotice, 150_000 + Math.random() * 150_000);
    };

    const showNotice = () => {
      if (!active) return;
      const hasOpenDialog = document.querySelector('[role="dialog"][aria-modal="true"]');
      if (document.visibilityState === 'visible' && !hasOpenDialog) {
        const buyer = buyers[language][Math.floor(Math.random() * buyers[language].length)];
        const product = products[Math.floor(Math.random() * products.length)];
        setNotice({ ...buyer, product });
        closeTimer = setTimeout(() => setNotice(null), 6500);
      }
      scheduleNextNotice();
    };

    firstTimer = setTimeout(showNotice, 15_000 + Math.random() * 15_000);
    return () => {
      active = false;
      clearTimeout(firstTimer);
      if (closeTimer) clearTimeout(closeTimer);
      if (nextTimer) clearTimeout(nextTimer);
      setNotice(null);
    };
  }, [language, paused, products]);

  const dismiss = () => setNotice(null);
  const productName = notice && (language === 'ar' ? notice.product.nameAr || notice.product.name : notice.product.name);

  return <AnimatePresence>
    {notice && <motion.aside
      role="status"
      aria-live="polite"
      dir={language === 'en' ? 'ltr' : 'rtl'}
      initial={{ opacity: 0, x: -18, y: 8 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: -12, y: 6 }}
      transition={{ duration: 0.24 }}
      className="fixed bottom-5 left-4 z-[55] flex w-[min(22rem,calc(100vw-2rem))] items-center gap-3 rounded-xl border border-[#d8d6c5] bg-[#fbfaf6] p-3 text-[#4E563C] shadow-xl"
    >
      <StoredMedia type="image" source={notice.product.image} alt={productName || ''} className="size-14 shrink-0 rounded-lg object-cover" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-xs font-bold text-[#777653]"><ShoppingBag size={13} />{language === 'ar' ? 'عملية شراء حديثة' : 'Recent purchase'}</p>
        <p className="mt-1 text-sm leading-5">{language === 'ar'
          ? `${notice.buyer} من ${notice.city} اشترت ${productName} قبل قليل`
          : `${notice.buyer} from ${notice.city} just purchased ${productName}`}</p>
      </div>
      <button type="button" onClick={dismiss} aria-label={t('close')} className="grid size-8 shrink-0 place-items-center rounded-full text-[#68705d] hover:bg-[#eeecdf]"><X size={16} /></button>
    </motion.aside>}
  </AnimatePresence>;
}