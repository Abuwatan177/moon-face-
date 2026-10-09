import { useEffect, useState, useRef } from 'react';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Heart, Share2, ShoppingBag } from 'lucide-react';
import AnimatedActionButton from './AnimatedActionButton';
import MediaCarousel from './MediaCarousel';
import ProductEngagement from './ProductEngagement';
import TutorialsSection from './TutorialsSection';
import StoredMedia from './StoredMedia';
import { useScrollReveal } from '../hooks/useScrollReveal';
import type { Product } from '../data/products';
import type { SiteContent } from '../data/siteContent';
import type { WishlistItem } from '../App';
import { normalizeProductType, translateProductBadge, translateProductColor, translateProductType, useLanguage } from '../i18n';
import { getProductColorStyle } from '../utils/productColors';
import { readRecentlyViewedProductIds, trackRecentlyViewedProduct } from '../utils/recentlyViewed';
import { usePageMetadata } from '../hooks/usePageMetadata';
import { getProductShareUrl } from '../lib/api';

const hasAvailableVariant = (product: Product) => product.colors.some((color) => color.available);

function mediaForColor(product: Product, colorName: string): NonNullable<Product['media']> {
  const color = product.colors?.find((item) => item.name === colorName);
  const colorImages = color?.images?.length
    ? color.images
    : product.images.filter((item) => item.color === colorName).map((item) => item.img);
  const imageUrls = colorImages.length ? colorImages : color?.image ? [color.image] : [];
  const colorMedia = color?.media || [];
  return [
    ...imageUrls.map((url) => ({ type: 'image' as const, url })),
    ...colorMedia,
    ...(product.media || []),
  ].filter((item, index, media) => item.url && media.findIndex((candidate) => candidate.type === item.type && candidate.url === item.url) === index);
}
const productsPerPage = 10;
const compareProducts = (first: Product, second: Product) => {
  const stockOrder = Number(hasAvailableVariant(second)) - Number(hasAvailableVariant(first));
  if (stockOrder) return stockOrder;
  return first.displayOrder !== undefined && second.displayOrder !== undefined
    ? first.displayOrder - second.displayOrder
    : Number(second.id) - Number(first.id);
};

function readProductIdFromUrl() {
  const value = new URLSearchParams(window.location.search).get('product');
  const productId = Number(value);
  return Number.isSafeInteger(productId) && productId > 0 ? productId : null;
}

function productShareUrl(productId: number | null) {
  const url = new URL(window.location.pathname, window.location.origin);
  if (productId !== null) url.searchParams.set('product', String(productId));
  return url.href;
}

// تم استخدام 'any' لتجاوز خطأ التايب سكربت المزعج
export function ProductCard({ product, index, onAdd, liked, onToggleWishlist, selected, onSelect, onRequireAuth, animateOnView = true, variant = 'store' }: { product: Product; index: number; onAdd: (product: Product, color: string) => void; liked: boolean; onToggleWishlist: (product: Product, color: string) => void; selected: boolean; onSelect: (productId: number) => void; onRequireAuth: () => void; animateOnView?: boolean; variant?: 'store' | 'offer' }) {  const { language, t } = useLanguage();
  const isOffer = variant === 'offer';
  const cardRef = useRef<HTMLDivElement>(null);
  const cardInView = useInView(cardRef, { once: true, margin: '0px 0px -8% 0px' });
  const colorOptions: Product['colors'] = product.colors?.length ? product.colors : product.images.map((item) => ({ name: item.color, image: item.img, available: true }));
  const colors = [...colorOptions].sort((first, second) => Number(second.available) - Number(first.available));
  
  const [selectedColor, setSelectedColor] = useState(colors[0]?.name || '');
  const activeColor = colors.find((item) => item.name === selectedColor) || colors[0];
  
  const cardMedia = mediaForColor(product, selectedColor);

  const discountPercentage = product.originalPrice > product.price
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  const productAvailable = Boolean(activeColor?.available);
  const canAddToCart = productAvailable;

  return (
    <motion.div ref={cardRef} dir={language === 'en' ? 'ltr' : 'rtl'} layout initial={{ opacity: 0, y: 22 }} animate={cardInView || !animateOnView ? { opacity: 1, y: 0 } : { opacity: 0, y: 22 }} transition={{ duration: 0.36, delay: Math.min(index * 0.035, 0.18) }} className={`group h-full scroll-mt-32 rounded-2xl ${isOffer ? 'bg-transparent p-1 text-white shadow-none' : 'bg-white p-2.5 text-[#292c23] shadow-sm hover:shadow-lg max-[520px]:rounded-xl max-[520px]:p-1.5'} transition-shadow ${selected ? 'ring-2 ring-moon-face-400 shadow-lg shadow-moon-face-200/40' : ''}`}>
      <div role="button" tabIndex={0} onClick={() => onSelect(product.id)} onKeyDown={(event) => event.key === 'Enter' && onSelect(product.id)} aria-label={`${t('detailsLabel')}: ${language === 'ar' ? product.nameAr : product.name}`} className="relative mb-3 aspect-[3/4] cursor-pointer overflow-hidden rounded-xl bg-moon-face-100 max-[520px]:mb-2 max-[520px]:rounded-lg">
        <MediaCarousel key={`${product.id}:${activeColor?.name || ''}`} items={cardMedia} alt={`${language === 'ar' ? product.nameAr : product.name} - ${activeColor?.name || ''}`} className="absolute inset-0 h-full w-full bg-[#eeecdf]" fit="cover" />
        <span className={`absolute top-3 left-3 max-w-[calc(100%-2.5rem)] truncate rounded-full px-3 py-1 text-sm font-bold max-[520px]:top-2 max-[520px]:left-2 max-[520px]:px-2 max-[520px]:py-1 max-[520px]:text-xs ${isOffer ? 'bg-[#9a5539] text-white' : 'bg-white/90 text-[#292c23]'}`}>{product.originalPrice > product.price && !product.badge ? t('salesLabel') : translateProductBadge(product.badge || '', language)}</span>
        <span className={`absolute bottom-3 left-3 rounded-full px-3 py-1 text-sm font-bold max-[520px]:bottom-2 max-[520px]:left-2 max-[520px]:px-2 max-[520px]:py-1 max-[520px]:text-sm ${productAvailable ? 'availability-available' : 'availability-unavailable'}`}>
          {productAvailable ? t('inStock') : t('outOfStock')}
        </span>
        {!isOffer && <button onClick={(event) => { event.stopPropagation(); onToggleWishlist(product, selectedColor); }} className="absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 shadow-md transition-all hover:scale-110 max-[520px]:right-1.5 max-[520px]:top-1.5 max-[520px]:h-8 max-[520px]:w-8" aria-label={liked ? t('removeWishlist') : t('wishlist')}>
          <Heart className={`h-4 w-4 max-[520px]:h-3.5 max-[520px]:w-3.5 ${liked ? 'fill-red-500 text-red-500' : ''}`} />
        </button>}
      </div>

      <div className="px-1">
        <div className="flex items-center justify-between mb-1">
          <button type="button" onClick={() => onSelect(product.id)} className={`text-start font-bold text-lg leading-7 transition-colors cursor-pointer max-[520px]:text-[17px] max-[520px]:leading-7 ${isOffer ? 'text-white hover:text-moon-face-200' : 'text-[#292c23] hover:text-moon-face-700'}`}>
            {language === 'ar' ? product.nameAr : product.name}
          </button>
        </div>
        <button type="button" onClick={() => onSelect(product.id)} className={`mb-2 block text-base text-start transition-colors cursor-pointer max-[520px]:text-[15px] max-[520px]:leading-6 ${isOffer ? 'text-white/75 hover:text-white' : 'text-[#535449] hover:text-moon-face-600'}`}>
          {language === 'ar' ? `${product.name} - ${t('color')} ${translateProductColor(activeColor?.name || '', language)}` : `${t('color')} ${translateProductColor(activeColor?.name || '', language)}`}
        </button>
        
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 xl:w-auto">
            <span className="text-2xl font-bold max-[520px]:text-[22px]">₪{product.price}</span>
            {product.originalPrice > product.price && <span className={`text-base line-through max-[520px]:text-[15px] ${isOffer ? 'text-white/60' : 'text-charcoal-500'}`}>₪{product.originalPrice}</span>}
            {discountPercentage > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-sm font-bold text-red-700 min-[700px]:basis-full xl:basis-auto max-[520px]:px-1.5 max-[520px]:text-[13px]">{language === 'en' ? `${discountPercentage}% ${t('discount')}` : `${t('discount')} ${discountPercentage}%`}</span>}
          </div>
          <AnimatedActionButton
            disabled={!canAddToCart} 
            onAction={() => onAdd(product, selectedColor)}
            icon={<ShoppingBag className="h-4 w-4 max-[520px]:h-3.5 max-[520px]:w-3.5" />}
            className={`inline-flex w-full basis-full items-center justify-center gap-1.5 rounded-xl px-2.5 py-2.5 text-base font-bold text-white shadow-md transition-all hover:-translate-y-0.5 active:scale-95 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed sm:gap-2 xl:w-auto xl:basis-auto xl:px-4 max-[520px]:gap-1 max-[520px]:whitespace-nowrap max-[520px]:px-1 max-[520px]:py-2.5 max-[520px]:text-[15px] ${isOffer ? 'bg-[#9a5539] hover:bg-[#82452f]' : 'bg-[#3B2A22] hover:bg-moon-face-700'}`}
          >
            {t('addToCart')}
          </AnimatedActionButton>
        </div>

        <div className="mt-3 flex gap-1.5 max-[520px]:mt-2 max-[520px]:gap-1">
          {colors.map((item) => {
            const hasAnySizeAvailable = item.available;
            const selected = selectedColor === item.name; 
            
            return (
              <button 
                key={item.name} 
                onClick={() => setSelectedColor(item.name)}
                className={`relative rounded-full transition-transform hover:scale-110 ${isOffer ? 'h-4 w-4' : 'h-6 w-6'} ${selected ? `${isOffer ? 'ring-1 ring-offset-1' : 'ring-2 ring-offset-2'} ring-[#c59b52] scale-110` : 'border border-gray-200'} ${!hasAnySizeAvailable ? 'opacity-60 grayscale' : ''}`} 
                style={getProductColorStyle(item.name, item.customColor)}
                aria-label={`${t('color')} ${translateProductColor(item.name, language)}`}
                title={translateProductColor(item.name, language)}
              >
                {!hasAnySizeAvailable && (
                  <span className="absolute inset-0 flex items-center justify-center text-red-600 font-bold text-xs bg-black/30 rounded-full">×</span>
                )}
              </button>
            ); 
          })}
        </div>
        {!isOffer && <ProductEngagement product={product} onRequireAuth={onRequireAuth} />}
      </div>
    </motion.div>
  );
}

export default function ProductShowcase({ products: initialProducts, productTypes, tutorials, onAdd, wishlist, onToggleWishlist, onRequireAuth }: { products: Product[]; productTypes: string[]; tutorials: SiteContent['tutorials']; onAdd: (product: Product, color: string) => void; wishlist: WishlistItem[]; onToggleWishlist: (product: Product, color: string) => void; onRequireAuth: () => void }) {
  const [activeType, setActiveType] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(readProductIdFromUrl);
  const typeRailRef = useRef<HTMLElement | null>(null);
  const cloudProducts = initialProducts;
  const { ref, inView } = useScrollReveal(0.05);
  const { language, t } = useLanguage();
  const selectedProductForMeta = cloudProducts.find((product) => product.id === selectedProductId);
  const metaProductName = selectedProductForMeta && (language === 'ar' ? selectedProductForMeta.nameAr || selectedProductForMeta.name : selectedProductForMeta.name);
  const metaDescription = selectedProductForMeta
    ? language === 'ar'
      ? `${metaProductName} من تشكيلة Moon Face${selectedProductForMeta.category ? `، ضمن قسم ${selectedProductForMeta.category}` : ''}. السعر ₪${selectedProductForMeta.price}. اكتشفي التفاصيل والألوان المتاحة.`
      : `Shop ${metaProductName} from Moon Face${selectedProductForMeta.category ? ` in ${selectedProductForMeta.category}` : ''}. Priced at ₪${selectedProductForMeta.price}, with product details and available colors.`
    : t('seoStoreDescription');
  usePageMetadata({
    title: selectedProductForMeta ? `${metaProductName} | Moon Face` : t('seoStoreTitle'),
    description: metaDescription,
    image: selectedProductForMeta?.image || '/media/favicon.svg',
    url: productShareUrl(selectedProductForMeta?.id ?? null),
    type: selectedProductForMeta ? 'product' : 'website',
  });
  const specificProductTypes = [...new Set([...productTypes, ...cloudProducts.map((product) => product.productType || '')]
    .map((type) => type.trim())
    .filter((type) => type && normalizeProductType(type) !== 'hijabs' && cloudProducts.some((product) => product.productType?.trim() === type)))];
  const typeOptions = specificProductTypes.map((type) => ({
    value: type,
    label: translateProductType(type, language),
    count: cloudProducts.filter((product) => product.productType?.trim() === type).length,
    image: cloudProducts.find((product) => product.productType?.trim() === type)?.image,
  }));
  const scrollTypeRail = (direction: -1 | 1) => {
    const rail = typeRailRef.current;
    if (rail) rail.scrollBy({ left: direction * (language === 'ar' ? -1 : 1) * rail.clientWidth * 0.8, behavior: 'smooth' });
  };

  useEffect(() => {
    const selectProduct = (event: Event) => {
      const productId = Number((event as CustomEvent<number>).detail);
      const product = cloudProducts.find((item) => Number(item.id) === productId);
      if (!product) return;
      const productIndex = cloudProducts.slice().sort(compareProducts).findIndex((item) => item.id === productId);
      setActiveType('all');
      setCurrentPage(Math.floor(Math.max(0, productIndex) / productsPerPage) + 1);
      setSelectedProductId(productId);
      document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    document.addEventListener('moon-face:select-product', selectProduct);
    return () => document.removeEventListener('moon-face:select-product', selectProduct);
  }, [cloudProducts]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedProductId === null) url.searchParams.delete('product');
    else url.searchParams.set('product', String(selectedProductId));
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [selectedProductId]);
  
  const visible = cloudProducts.filter((product) => activeType === 'all' || product.productType?.trim() === activeType)
    .slice()
    .sort(compareProducts);
  const pageCount = Math.max(1, Math.ceil(visible.length / productsPerPage));
  const activePage = Math.min(currentPage, pageCount);
  const pageProducts = visible.slice((activePage - 1) * productsPerPage, activePage * productsPerPage);

  useEffect(() => {
    if (!selectedProductId) return;
    const timer = window.setTimeout(() => {
      const target = document.querySelector(`[data-product-id="${selectedProductId}"]`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [selectedProductId]);

  return (
    <>
    <section aria-labelledby="shop-by-type-heading" className="bg-transparent pt-8 sm:pt-10">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-10 lg:px-16">
        <h2 id="shop-by-type-heading" className="mb-3 text-3xl font-extrabold text-[#414235] sm:text-4xl">{t('shopByType')}</h2>
        {typeOptions.length > 0 ? <>
          <nav ref={typeRailRef} aria-label={t('productTypeFilter')} dir={language === 'en' ? 'ltr' : 'rtl'} className="filter-rail snap-x snap-mandatory items-start">
          {typeOptions.map((type) => <button key={type.value} type="button" onClick={() => { setActiveType(type.value); setCurrentPage(1); setSelectedProductId(null); document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} aria-pressed={activeType === type.value} className={`group relative isolate aspect-[1.55/1] w-[18rem] shrink-0 snap-start overflow-hidden rounded-xl border text-start shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg max-[380px]:w-[78vw] sm:w-80 ${activeType === type.value ? 'border-[#68704B] ring-2 ring-[#68704B]/35' : 'border-[#a56c4f]/35'}`}>
            {type.image ? <>
              <img src={type.image} alt="" aria-hidden="true" loading="lazy" decoding="async" className="absolute inset-0 z-0 h-full w-full scale-110 object-cover blur-xl opacity-75" />
              <img src={type.image} alt="" loading="lazy" decoding="async" className="absolute inset-0 z-10 h-full w-full object-contain" />
            </> : <div className="absolute inset-0 bg-[#514332]" />}
            <span aria-hidden="true" className="absolute inset-0 z-20 bg-gradient-to-t from-[#2E241D]/90 via-[#2E241D]/25 to-[#2E241D]/5" />
            <span aria-hidden="true" className="absolute inset-0 z-30" style={{ background: 'linear-gradient(125deg, rgba(255,255,255,.52) 0%, rgba(255,255,255,.1) 27%, transparent 43%, rgba(255,255,255,.16) 70%, transparent 100%)' }} />
            <span className="absolute inset-x-3 bottom-3 z-40 flex items-end justify-between gap-2 sm:inset-x-4 sm:bottom-4">
              <span className="min-w-0 truncate text-base font-bold text-white drop-shadow sm:text-lg">{type.label}</span>
              <span className="shrink-0 rounded-full bg-[#9a5539]/95 px-2.5 py-1 text-xs font-bold text-white shadow-sm backdrop-blur-sm">{type.count} {t('products')}</span>
            </span>
            <span className="sr-only">{type.label}: {type.count} {t('products')}</span>
          </button>)}
          </nav>
          {typeOptions.length > 1 && <div className="mt-2 flex justify-center gap-2" dir="ltr">
            <button type="button" onClick={() => scrollTypeRail(-1)} title={t('previousMedia')} aria-label={t('previousMedia')} className="grid size-9 place-items-center rounded-full border border-moon-face-300 text-moon-face-800 transition-colors hover:bg-moon-face-100"><ChevronLeft size={18} /></button>
            <button type="button" onClick={() => scrollTypeRail(1)} title={t('nextMedia')} aria-label={t('nextMedia')} className="grid size-9 place-items-center rounded-full border border-moon-face-300 text-moon-face-800 transition-colors hover:bg-moon-face-100"><ChevronRight size={18} /></button>
          </div>}
        </> : <p className="border-b border-[#c6c9b2] pb-5 text-sm text-[#68705d]">{t('noSpecificProductTypes')}</p>}
      </div>
    </section>
    <TutorialsSection content={tutorials} />
    <section id="products" ref={ref} className="bg-transparent pt-8 pb-4 sm:pt-10 sm:pb-6">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-10 lg:px-16">
        <motion.header initial={{ opacity: 0, y: 18 }} animate={inView ? { opacity: 1, y: 0 } : {}} dir="ltr" className="mb-5 flex items-end justify-between gap-3 sm:mb-7">
          <p className="shrink-0 whitespace-nowrap pb-0.5 text-sm text-[#68705d] sm:text-base">{visible.length} {t('products')}</p>
          <div dir={language === 'en' ? 'ltr' : 'rtl'} className="min-w-0 text-start">
            <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[#677653]">Moon Face / Shop</span>
            <h2 className={`mt-2 ${language === 'ar' ? 'font-arabic' : 'font-display'} text-3xl font-extrabold text-[#504A35] sm:text-4xl`}>{t('collection')}</h2>
          </div>
        </motion.header>
        <nav aria-label={t('productTypeFilter')} dir={language === 'en' ? 'ltr' : 'rtl'} className="mb-5 flex flex-wrap gap-2 border-b border-[#c6c9b2] pb-2 sm:mb-6">
          <button type="button" onClick={() => { setActiveType('all'); setCurrentPage(1); setSelectedProductId(null); }} aria-pressed={activeType === 'all'} className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${activeType === 'all' ? 'border-[#6B704B] bg-[#6B704B] text-white' : 'border-[#d4d2b5] text-[#6B704B] hover:bg-[#e8e5d2]'}`}>{t('all')}</button>
          {typeOptions.map((type) => <button key={type.value} type="button" onClick={() => { setActiveType(type.value); setCurrentPage(1); setSelectedProductId(null); }} aria-pressed={activeType === type.value} className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${activeType === type.value ? 'border-[#6B704B] bg-[#6B704B] text-white' : 'border-[#d4d2b5] text-[#6B704B] hover:bg-[#e8e5d2]'}`}>{type.label}</button>)}
        </nav>
        <main>
            <AnimatePresence mode="wait">
              <motion.div key={`${activeType}-${activePage}`} initial={{ opacity: 0, x: language === 'ar' ? 22 : -22 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: language === 'ar' ? -22 : 22 }} transition={{ duration: 0.24, ease: 'easeOut' }} className="grid auto-rows-fr grid-cols-2 gap-x-3 gap-y-6 max-[380px]:grid-cols-1 sm:gap-x-6 sm:gap-y-12">
                {pageProducts.map((product, index) => <div key={product.id || index} data-product-id={product.id} className="h-full">
                  <ProductCard product={product} index={index} onAdd={onAdd} liked={wishlist.some((item) => item.id === product.id)} onToggleWishlist={onToggleWishlist} selected={selectedProductId === product.id} onSelect={setSelectedProductId} onRequireAuth={onRequireAuth} />
                </div>)}
                {!visible.length && <div className="col-span-full border-y border-[#c6c9b2] py-20 text-center"><p className="font-display text-2xl text-[#716B4E]">{t('comingSoon')}</p><p className="mt-2 text-base text-[#777d6a]">{t('noProducts')}</p></div>}
              </motion.div>
            </AnimatePresence>
            <nav aria-label={t('productPages')} className="mt-10 flex items-center justify-center gap-2" dir={language === 'en' ? 'ltr' : 'rtl'}>
              <button type="button" onClick={() => { setCurrentPage(Math.max(1, activePage - 1)); document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} disabled={activePage <= 1} aria-label={t('previousPage')} className="grid size-11 shrink-0 place-items-center bg-transparent text-[#606748] transition-transform hover:scale-110 disabled:opacity-35"><ChevronLeft className={language === 'ar' ? 'rotate-180' : ''} size={25} /></button>
              <div className="flex max-w-[70vw] touch-pan-x overscroll-x-contain gap-2 overflow-x-auto px-1 py-1">
                {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => <button key={page} type="button" onClick={() => { setCurrentPage(page); document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} aria-current={page === activePage ? 'page' : undefined} className={`grid size-11 shrink-0 place-items-center rounded-full border text-base font-bold transition-all ${page === activePage ? 'border-[#606748] bg-[#606748] text-white shadow-md' : 'border-[#d4d2b5] bg-white text-[#414235] hover:bg-[#e8e5d2]'}`}>{page}</button>)}
              </div>
              <button type="button" onClick={() => { setCurrentPage(Math.min(pageCount, activePage + 1)); document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} disabled={activePage >= pageCount} aria-label={t('nextPage')} className="grid size-11 shrink-0 place-items-center bg-transparent text-[#606748] transition-transform hover:scale-110 disabled:opacity-35"><ChevronRight className={language === 'ar' ? 'rotate-180' : ''} size={25} /></button>
            </nav>
        </main>
      </div>
      {selectedProductId !== null && cloudProducts.find((product) => product.id === selectedProductId) && (
        <ProductDetails
          key={selectedProductId}
          product={cloudProducts.find((product) => product.id === selectedProductId)!}
          products={cloudProducts}
          liked={wishlist.some((item) => item.id === selectedProductId)}
          onClose={() => setSelectedProductId(null)}
          onAdd={onAdd}
          onToggleWishlist={onToggleWishlist}
          onSelectProduct={setSelectedProductId}
        />
      )}
    </section>
    </>
  );
}

function ProductDetails({ product, products, liked, onClose, onAdd, onToggleWishlist, onSelectProduct }: {
  product: Product;
  products: Product[];
  liked: boolean;
  onClose: () => void;
  onAdd: (product: Product, color: string) => void;
  onToggleWishlist: (product: Product, color: string) => void;
  onSelectProduct: (productId: number) => void;
}) {
  const { language, t } = useLanguage();
  const colorOptions: Product['colors'] = product.colors?.length ? product.colors : product.images.map((item) => ({ name: item.color, image: item.img, available: true }));
  const colors = [...colorOptions].sort((first, second) => Number(second.available) - Number(first.available));
  const [selectedColor, setSelectedColor] = useState(colors[0]?.name || '');
  const [shareNotice, setShareNotice] = useState('');
  const [showAllRelated, setShowAllRelated] = useState(false);
  const activeColor = colors.find((color) => color.name === selectedColor) || colors[0];
  const detailMedia = mediaForColor(product, selectedColor);
  const canAdd = Boolean(activeColor?.available);
  const [recentlyViewedIds, setRecentlyViewedIds] = useState(readRecentlyViewedProductIds);
  const category = product.category.trim().toLocaleLowerCase();
  const relatedProducts = category
    ? products.filter((item) => item.id !== product.id && item.category.trim().toLocaleLowerCase() === category).slice(0, 10)
    : [];
  const recentlyViewedProducts = recentlyViewedIds
    .filter((id) => id !== product.id)
    .map((id) => products.find((item) => item.id === id))
    .filter((item): item is Product => Boolean(item))
    .slice(0, 5);
  const visibleRelatedProducts = showAllRelated ? relatedProducts : relatedProducts.slice(0, 3);

  useEffect(() => {
    setRecentlyViewedIds(trackRecentlyViewedProduct(product.id));
  }, [product.id]);

  const shareProduct = async () => {
    const name = language === 'ar' ? product.nameAr || product.name : product.name;
    const shareUrl = getProductShareUrl(product.id);
    try {
      if (navigator.share) {
        await navigator.share({ title: `${name} | Moon Face`, text: name, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setShareNotice(t('shareLinkCopied'));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareNotice(t('shareLinkFailed'));
    }
  };

  const productRail = (title: string, items: Product[]) => items.length > 0 && <section className="mt-7 border-t border-moon-face-200 pt-5">
    <h3 className="mb-3 text-base font-bold text-[#4E563C]">{title}</h3>
    <div className="flex gap-3 overflow-x-auto pb-2" dir={language === 'en' ? 'ltr' : 'rtl'}>
      {items.map((item) => <button type="button" key={item.id} onClick={() => onSelectProduct(item.id)} className="w-32 shrink-0 overflow-hidden rounded-lg border border-moon-face-200 bg-white text-start transition-shadow hover:shadow-md sm:w-36">
        <StoredMedia type="image" source={item.image} alt={language === 'ar' ? item.nameAr : item.name} className="aspect-[4/3] w-full object-cover" />
        <span className="block truncate px-2 pt-2 text-xs font-semibold">{language === 'ar' ? item.nameAr : item.name}</span>
        <span className="block px-2 pb-2 pt-1 text-xs text-charcoal-600">₪{item.price}</span>
      </button>)}
    </div>
  </section>;

  const relatedProductsSection = relatedProducts.length > 0 && <section className="mt-7 border-t border-moon-face-200 pt-5">
    <h3 className="mb-3 text-base font-bold text-[#4E563C]">{t('relatedProducts')}</h3>
    <div className="grid grid-cols-3 gap-2" dir={language === 'en' ? 'ltr' : 'rtl'}>
      {visibleRelatedProducts.map((item) => <button type="button" key={item.id} onClick={() => { setShowAllRelated(false); onSelectProduct(item.id); }} className="min-w-0 overflow-hidden rounded-lg border border-moon-face-200 bg-white text-start transition-shadow hover:shadow-md">
        <StoredMedia type="image" source={item.image} alt={language === 'ar' ? item.nameAr : item.name} className="aspect-[4/3] w-full object-cover" />
        <span className="block truncate px-2 pt-2 text-xs font-semibold">{language === 'ar' ? item.nameAr : item.name}</span>
        <span className="block px-2 pb-2 pt-1 text-xs text-charcoal-600">₪{item.price}</span>
      </button>)}
    </div>
    {relatedProducts.length > 3 && <button type="button" aria-expanded={showAllRelated} onClick={() => setShowAllRelated((expanded) => !expanded)} className="mx-auto mt-3 flex items-center gap-2 rounded-full border border-moon-face-200 bg-white px-4 py-2 text-sm font-semibold text-[#68704B] hover:bg-moon-face-50">
      {showAllRelated ? <><ChevronUp size={17} />{t('showFewerProducts')}</> : <><ChevronDown size={17} />{t('showMoreProducts')} ({relatedProducts.length - 3})</>}
    </button>}
  </section>;

  return <AnimatePresence>
    <motion.div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-2 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <motion.div role="dialog" aria-modal="true" aria-label={`${t('detailsLabel')}: ${language === 'ar' ? product.nameAr : product.name}`} dir={language === 'en' ? 'ltr' : 'rtl'} className="relative flex h-[calc(100dvh-1rem)] max-h-[56rem] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-[#faf8f5] shadow-2xl md:grid md:h-[min(92vh,54rem)] md:max-h-none md:grid-cols-2" initial={{ y: 18, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 12, scale: 0.98 }}>
        <button type="button" onClick={onClose} className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 shadow" aria-label={t('close')}><span aria-hidden="true">×</span></button>
        <div className="h-[min(44dvh,26rem)] min-h-[12rem] shrink-0 bg-[#eeecdf] md:h-auto md:min-h-[36rem]">
          <MediaCarousel key={`${product.id}:${selectedColor}`} items={detailMedia} alt={`${language === 'ar' ? product.nameAr : product.name} - ${selectedColor}`} className="h-full min-h-0 w-full md:min-h-[36rem]" fit="contain" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-8 md:p-8">
          {product.badge && <span className="text-xs font-semibold text-moon-face-700">{translateProductBadge(product.badge, language)}</span>}
          <h2 className="mt-2 text-2xl font-extrabold">{language === 'ar' ? product.nameAr : product.name}</h2>
          {language === 'ar' && <p className="text-sm text-charcoal-500">{product.name}</p>}
          <div className="mt-4 flex items-center gap-3"><b className="text-xl">₪{product.price}</b>{product.originalPrice > product.price && <><del className="text-sm text-charcoal-400">₪{product.originalPrice}</del><span className="text-xs font-bold text-red-700">{t('salesLabel')}</span></>}</div>
          {product.description?.trim() && <p className="mt-3 whitespace-pre-line text-sm leading-7 text-charcoal-600">{product.description}</p>}
          <div className="mt-4 mb-3">
            <p className="mb-2 text-sm font-bold">{t('color')}: {translateProductColor(selectedColor, language)}</p>
            <div className="flex flex-wrap gap-2">{colors.map((color) => {
              const available = Boolean(color.available);
              return <button type="button" key={color.name} disabled={!available} onClick={() => setSelectedColor(color.name)} className={`grid size-11 place-items-center rounded-full border shadow-sm transition-transform hover:scale-105 disabled:opacity-40 ${selectedColor === color.name ? 'ring-2 ring-[#68704B] ring-offset-2' : 'border-charcoal-200'}`} style={getProductColorStyle(color.name, color.customColor)} aria-label={translateProductColor(color.name, language)} title={translateProductColor(color.name, language)} aria-pressed={selectedColor === color.name}><span className="sr-only">{translateProductColor(color.name, language)}</span></button>;
            })}</div>
          </div>
          <div className="sticky bottom-0 z-[1] grid grid-cols-[minmax(0,1fr)_3rem_3rem] gap-2 border-t border-[#d3d4bf] bg-[#faf8f5] py-3">
            <AnimatedActionButton type="button" disabled={!canAdd} onAction={() => onAdd(product, selectedColor)} onSuccess={onClose} icon={<ShoppingBag size={18} />} className="flex items-center justify-center gap-2 rounded-lg bg-[#3B2A22] px-4 py-3 font-bold text-white disabled:opacity-40">{t('addToCart')}</AnimatedActionButton>
            <button type="button" onClick={() => onToggleWishlist(product, selectedColor)} className={`flex h-12 w-12 items-center justify-center rounded-lg border border-moon-face-200 bg-white ${liked ? 'text-red-600' : 'text-charcoal-700'}`} aria-label={liked ? t('removeWishlist') : t('wishlist')}><Heart size={19} className={liked ? 'fill-current' : ''} /></button>
            <button type="button" onClick={() => void shareProduct()} className="flex h-12 w-12 items-center justify-center rounded-lg border border-moon-face-200 bg-white text-charcoal-700" aria-label={t('shareProduct')} title={t('shareProduct')}><Share2 size={19} /></button>
          </div>
          {shareNotice && <p role="status" className="mt-2 text-xs text-charcoal-600">{shareNotice}</p>}
          {relatedProductsSection}
          {productRail(t('recentlyViewed'), recentlyViewedProducts)}
        </div>
      </motion.div>
    </motion.div>
  </AnimatePresence>;
}