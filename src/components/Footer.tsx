import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useLanguage } from '../i18n';
import { FaInstagram, FaSnapchat, FaTiktok, FaWhatsapp } from 'react-icons/fa6';
import type { SiteContent } from '../data/siteContent';

const socialLinks = [
  { label: 'Instagram', href: 'https://www.instagram.com/', Icon: FaInstagram },
  { label: 'Snapchat', href: 'https://www.snapchat.com/', Icon: FaSnapchat },
  { label: 'WhatsApp', href: 'https://www.whatsapp.com/', Icon: FaWhatsapp },
  { label: 'TikTok', href: 'https://www.tiktok.com/', Icon: FaTiktok },
];

export default function Footer({ policies }: { policies: SiteContent['policies'] }) {
  const { language, t } = useLanguage();
  const [openPolicy, setOpenPolicy] = useState<string | null>(null);
  const policyItems = [
    { key: 'delivery', title: t('shippingPolicy'), text: policies.delivery || t('shippingPolicyText') },
    { key: 'exchange', title: t('exchangePolicy'), text: policies.exchange || t('exchangePolicyText') },
    { key: 'returns', title: t('returnPolicy'), text: policies.returns || t('returnPolicyText') },
  ];

  return (
    <footer className="w-full border-t border-white/10 bg-[#3D2C22]/90 text-center text-[#f0eddf]" dir={language === 'en' ? 'ltr' : 'rtl'}>
      <div className="mx-auto grid max-w-[1440px] justify-items-center gap-3 px-5 py-5 sm:px-10 sm:py-7 lg:grid-cols-[1fr_2fr_1fr] lg:items-start lg:px-16">
        <div className="flex flex-col items-center">
          <span className="font-display text-2xl">Moon Face</span>
          <div className="mt-2 flex flex-wrap gap-2" aria-label="Social media">
            {socialLinks.map(({ label, href, Icon }) => <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={label} title={label} className="grid size-11 place-items-center rounded-full border border-white/25 text-[#f0eddf] transition-colors hover:border-[#b9bc93] hover:bg-[#606748]"><Icon size={18} /></a>)}
          </div>
        </div>
        <div className="grid gap-1 sm:grid-cols-3 sm:gap-2">
          {policyItems.map(({ key, title, text }) => <section key={key} className="border-t border-white/20 py-0">
            <button type="button" onClick={() => setOpenPolicy((current) => current === key ? null : key)} aria-expanded={openPolicy === key} className="flex min-h-9 w-full items-center justify-center gap-2 text-sm font-bold text-[#e8e5d2]">
              {title}<motion.span animate={{ rotate: openPolicy === key ? 180 : 0 }} transition={{ duration: 0.2 }}><ChevronDown size={18} /></motion.span>
            </button>
            <AnimatePresence initial={false}>{openPolicy === key && <motion.div initial={{ height: 0, opacity: 0, y: -4 }} animate={{ height: 'auto', opacity: 1, y: 0 }} exit={{ height: 0, opacity: 0, y: -4 }} transition={{ duration: 0.22 }} className="overflow-hidden"><p className="mx-auto max-w-lg px-2 pb-3 text-center text-sm leading-7 text-[#d4d2b5] sm:text-base">{text}</p></motion.div>}</AnimatePresence>
          </section>)}
        </div>
        <div className="flex flex-col items-center gap-2 text-center text-sm text-[#d4d2b5]">
          <p>&copy; {new Date().getFullYear()} Moon Face · {t('rights')}</p>
          <p>{t('designedBy')} <span className="font-display text-base text-[#f0eddf]">Watan Creative Agency</span></p>
        </div>
      </div>
    </footer>
  );
}