import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpLeft } from 'lucide-react';
import type { SiteContent } from '../data/siteContent';
import { translateText, type Language } from '../i18n';
import MediaCarousel from './MediaCarousel';

export default function EditorialHero({ content, featuredImage, language }: { content: SiteContent['hero']; featuredImage?: string; language: Language }) {
  const [activeLanguage, setActiveLanguage] = useState(language);
  useEffect(() => {
    const syncLanguage = (event: Event) => {
      const nextLanguage = (event as CustomEvent<Language>).detail;
      if (nextLanguage === 'ar' || nextLanguage === 'en') setActiveLanguage(nextLanguage);
    };
    document.addEventListener('moon-face:language-changed', syncLanguage);
    return () => document.removeEventListener('moon-face:language-changed', syncLanguage);
  }, []);
  const text = (key: string) => translateText(key, activeLanguage);
  const heroMedia = content.media?.length
    ? content.media
    : content.image || featuredImage
      ? [{ type: 'image' as const, url: content.image || featuredImage || '' }]
      : [];
  const title = activeLanguage === 'en'
    ? [text('heroLine1'), text('heroLine2'), text('heroLine3')].join(' ')
    : [content.titleLine1, content.titleLine2, content.titleLine3].filter(Boolean).join(' ');

  return (
    <section id="home" className="relative isolate flex min-h-[78svh] items-center overflow-hidden bg-[#575940] text-[#f6f3e8]" dir={activeLanguage === 'en' ? 'ltr' : 'rtl'}>
      <div className="absolute inset-0 z-0 overflow-hidden">
        {heroMedia.length ? (
          <MediaCarousel items={heroMedia} alt={activeLanguage === 'ar' ? content.titleLine1 || 'Moon Face' : text('newCollection')} className="absolute inset-0 h-full w-full" />
        ) : (
          <div className="absolute inset-0 flex flex-col justify-between bg-[#575940] p-7 sm:p-10">
            <span className="font-display text-xs tracking-[0.2em] text-[#d0d2bc]"></span>
            <span className="font-display text-[clamp(6rem,20vw,16rem)] leading-[0.7] text-[#899476]" aria-hidden="true"></span>
            <span className="font-display text-sm tracking-[0.12em] text-[#e4e2d5]"></span>
          </div>
        )}
      </div>
      <div className="hero-media-edge-blur pointer-events-none absolute inset-0 z-[1]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(180deg,rgba(24,32,24,0.2)_0%,rgba(24,32,24,0.12)_48%,rgba(24,32,24,0.38)_100%)]" />
      <div className="pointer-events-none relative z-[3] mx-auto flex min-h-[78svh] w-full max-w-[1440px] items-start justify-center px-5 pb-12 pt-32 text-center sm:px-10 sm:pt-36 lg:items-center lg:justify-end lg:px-16 lg:pt-36">
        <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="pointer-events-auto mx-auto w-full max-w-3xl lg:mx-0 lg:max-w-[26rem]">
          <h1 className={`${activeLanguage === 'ar' && title ? 'font-arabic' : 'font-display'} text-5xl font-medium leading-[1.12] text-[#fffdf5] [text-shadow:0_2px_18px_rgba(20,27,19,0.8)] sm:text-7xl lg:text-8xl`}>{title || 'Moon Face'}</h1>
          <p className="mx-auto mt-3 max-w-lg font-arabic text-sm leading-6 text-[#fffdf5] [text-shadow:0_2px_12px_rgba(20,27,19,0.9)] sm:mt-5 sm:text-lg sm:leading-9">
            {activeLanguage === 'ar' ? content.description || 'أناقة هادئة، تفاصيل من الأرض، وقطع صُممت لترافقك كل يوم.' : text('heroDescription')}
          </p>
        </motion.div>
      </div>
      <a href="#products" className="pointer-events-auto absolute bottom-8 left-1/2 z-[4] inline-flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center justify-center gap-3 rounded-full border border-white/40 bg-[#373126]/45 px-6 py-3 text-base font-semibold text-[#fffdf5] shadow-sm backdrop-blur-sm transition-all hover:border-[#d4d2b5] hover:bg-[#373126]/60 sm:bottom-10 lg:bottom-12">
        <span className="truncate">{activeLanguage === 'ar' ? content.primaryButton || 'اكتشفي التشكيلة' : text('heroPrimary')}</span>
        {activeLanguage === 'ar' ? <ArrowDownRight size={17} /> : <ArrowUpLeft size={17} />}
      </a>
      <div className="absolute bottom-0 left-5 right-5 h-px bg-white/15 sm:left-10 sm:right-10 lg:left-16 lg:right-16" />
    </section>
  );
}
