import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import StoredMedia from './StoredMedia';
import { Search, ShoppingBag, Heart, X, ArrowRight, CircleUserRound } from 'lucide-react';
import type { Product as StoreProduct } from '../data/products';
import type { WishlistItem } from '../App';
import { translateProductColor, useLanguage } from '../i18n';

type SearchResult = {
  id: number;
  name: string;
  nameAr: string;
  color: string;
  image: string;
};

export default function Navbar({ products, storeLogo, onCartOpen, onAccountOpen, isSignedIn, isGuest, cartCount, wishlist, onToggleWishlist }: { products: StoreProduct[]; storeLogo: string; onCartOpen: () => void; onAccountOpen: () => void; isSignedIn: boolean; isGuest: boolean; cartCount: number; wishlist: WishlistItem[]; onToggleWishlist: (product: StoreProduct, color: string) => void }) {
  const [scrolled, setScrolled] = useState(false);
  // حالات شريط البحث التفاعلي الجديد
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [cartPulse, setCartPulse] = useState(0);
  const [wishlistPulse, setWishlistPulse] = useState(0);
  const { language, setLanguage, t } = useLanguage();
  const searchRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const pulseCart = () => setCartPulse((count) => count + 1);
    const pulseWishlist = () => setWishlistPulse((count) => count + 1);
    document.addEventListener('moon-face:cart-added', pulseCart);
    document.addEventListener('moon-face:wishlist-added', pulseWishlist);
    return () => {
      document.removeEventListener('moon-face:cart-added', pulseCart);
      document.removeEventListener('moon-face:wishlist-added', pulseWishlist);
    };
  }, []);

  // إغلاق القائمة عند النقر خارج صندوق البحث لحفظ انسيابية التصفح
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && event.target instanceof Node && !searchRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // دالة المعالجة والمطابقة الفورية بناءً على الاسم العربي، الإنجليزي، أو اللون
  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (query.trim() === '') {
      setSearchResults([]);
      return;
    }

    const normalizedQuery = query.toLocaleLowerCase();
    const filtered = products.flatMap((product) => {
      const colors = product.colors?.length ? product.colors : [{ name: product.colorName || '', image: product.image }];
      return colors.map((color) => ({ id: product.id, name: product.name, nameAr: product.nameAr, color: color.name, image: color.image || product.image }))
        .filter((item) => [item.name, item.nameAr, item.color, product.category].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)));
    });
    setSearchResults(filtered);
  };
  const cycleLanguage = () => {
    setLanguage(language === 'ar' ? 'en' : 'ar');
  };
  const languageLabel = language === 'ar' ? 'ع' : 'EN';

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed inset-x-0 top-0 z-50 text-[#f0eddf] transition-all duration-300 ${scrolled ? 'border-b border-white/20 bg-[#3D2C22]/70 shadow-md backdrop-blur-2xl' : 'border-b border-white/10 bg-[#3D2C22]/90 shadow-sm'}`}
      >
        <div dir="ltr" className="relative mx-auto flex min-h-14 max-w-7xl items-center justify-between px-3 py-3 sm:min-h-20 sm:px-8 sm:py-4">
          {/* الأزرار اليمنى شاملة صندوق البحث التفاعلي والذكي */}
          <div className="relative z-20" ref={searchRef}>
            <div className="relative flex h-10 items-center">
              <AnimatePresence>
                {searchOpen && (
                  <motion.input
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    type="text"
                    value={searchQuery}
                    onChange={handleSearchChange}
                    placeholder={t('searchPlaceholder')}
                    dir={language === 'en' ? 'ltr' : 'rtl'}
                    className="fixed left-3 top-[4.5rem] z-10 h-11 w-[calc(100vw-1.5rem)] rounded-full border border-[#b8bea0] bg-[#f5f4ed] px-4 text-sm text-[#493729] placeholder:text-[#737a68] shadow-lg focus:outline-none focus:ring-2 focus:ring-moon-face-600 sm:left-8 sm:top-[5.5rem] sm:w-80"
                  />
                )}
              </AnimatePresence>

              <button
                onClick={() => {
                  setSearchOpen(!searchOpen);
                  if(searchOpen) { setSearchQuery(''); setSearchResults([]); }
                }}
                className="relative z-20 flex h-11 w-11 items-center justify-center bg-transparent text-[#f0eddf] transition-colors hover:text-[#b9bc93] max-[420px]:h-10 max-[420px]:w-10 max-[360px]:h-9 max-[360px]:w-9"
                aria-label={t('searchAria')}
              >
                {searchOpen ? <X className="w-4 h-4 text-moon-face-600" /> : <Search className="w-4 h-4" />}
              </button>
              <button onClick={cycleLanguage} className="relative z-20 ml-2 flex h-11 min-w-11 items-center justify-center rounded-full border border-[#d4d2b5] bg-transparent px-2 text-sm font-bold text-[#f0eddf] transition-colors hover:bg-white/10 max-[420px]:ml-1 max-[420px]:h-10 max-[420px]:min-w-10 max-[420px]:px-1 max-[360px]:h-9 max-[360px]:min-w-9 max-[360px]:text-xs" aria-label={`${t('changeLanguage')}: ${languageLabel}`} title={t('changeLanguage')}>{languageLabel}</button>

              {/* القائمة الصغيرة المنبثقة لعرض صور وفئات البحث التفاعلي */}
              <AnimatePresence>
                {searchOpen && searchResults.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 15 }}
                    className="fixed left-3 top-[7.5rem] z-50 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-[#d3d4bf] bg-white/95 p-2 shadow-xl backdrop-blur-md sm:left-8 sm:top-[8.5rem]"
                  >
                    <div className="max-h-64 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                      {searchResults.map((item, index) => (
                        <a
                          key={index}
                          href="#products"
                          onClick={() => {
                            document.dispatchEvent(new CustomEvent('moon-face:select-product', { detail: item.id }));
                            setSearchOpen(false);
                            setSearchQuery('');
                            setSearchResults([]);
                          }}
                          className="flex items-center gap-3 p-2 rounded-xl hover:bg-moon-face-100/60 transition-colors duration-200 group"
                        >
                          <StoredMedia type="image" source={item.image} alt={item.name} className="h-16 w-12 rounded-lg border border-charcoal-100 object-cover shadow-sm" />
                          <div className="flex-1 text-right" dir={language === 'en' ? 'ltr' : 'rtl'}>
                            <div className="text-sm font-bold text-[#493729] group-hover:text-[#716B4E] transition-colors">
                              {language === 'ar' ? item.nameAr : item.name}
                            </div>
                            <div className="text-xs text-[#737451] mt-0.5">
                              {t('color')}: {translateProductColor(item.color, language)}
                            </div>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-[#68715d] group-hover:text-[#a56c4f] transform rotate-180 transition-transform" />
                        </a>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>
          <a href="#home" aria-label={t('home')} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 grid h-12 w-[74px] place-items-center max-[420px]:h-10 max-[420px]:w-[62px] max-[360px]:h-8 max-[360px]:w-12 sm:h-16 sm:w-[99px] lg:h-[70px] lg:w-[109px]">
            <img src={storeLogo} alt="Moon Face" className="h-full w-full object-contain" />
          </a>
          <div dir={language === 'en' ? 'ltr' : 'rtl'} className="ml-auto flex items-center gap-1 sm:gap-1.5 max-[420px]:gap-0">

            <button type="button" onClick={onAccountOpen} className="flex h-11 w-11 items-center justify-center bg-transparent text-[#f0eddf] transition-colors hover:text-[#b9bc93] max-[420px]:h-10 max-[420px]:w-10 max-[360px]:h-9 max-[360px]:w-9" aria-label={isSignedIn ? t('myAccount') : isGuest ? t('guestAccount') : t('login')} title={isSignedIn ? t('myAccount') : isGuest ? t('guestAccount') : t('login')}>
              <CircleUserRound size={18} />
            </button>

            <button
              data-cart-target
              onClick={onCartOpen}
              className="relative flex h-11 w-11 items-center justify-center bg-transparent text-[#f0eddf] transition-colors hover:text-[#b9bc93] max-[420px]:h-10 max-[420px]:w-10 max-[360px]:h-9 max-[360px]:w-9"
              aria-label={t('openCart')}
            >
              <motion.span key={`cart-pulse-${cartPulse}`} initial={{ y: 0, rotate: 0, scale: 1 }} animate={cartPulse ? { y: [0, -12, 0, -4, 0], rotate: [0, -22, 18, -8, 0], scale: [1, 1.38, 0.95, 1.12, 1] } : { y: 0, rotate: 0, scale: 1 }} transition={{ duration: 0.82, ease: 'easeOut' }}>
                <ShoppingBag className="w-5 h-5" />
              </motion.span>
              <motion.span key={`cart-count-${cartCount}`} initial={{ scale: 0.65 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 16 }} className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#f6f3e8] bg-earth-clay px-1 text-xs font-bold text-white shadow-sm">{cartCount}</motion.span>
            </button>

            <div className="relative">
              <button data-wishlist-target onClick={() => setWishlistOpen((open) => !open)} className="relative flex h-11 w-11 items-center justify-center bg-transparent text-[#f0eddf] transition-colors hover:text-[#b9bc93] max-[420px]:h-10 max-[420px]:w-10 max-[360px]:h-9 max-[360px]:w-9" aria-label={t('wishlist')}>
                <motion.span key={wishlistPulse} initial={{ scale: 1, rotate: 0 }} animate={wishlistPulse ? { scale: [1, 1.55, 0.78, 1.18, 1], rotate: [0, -24, 16, -8, 0] } : { scale: 1, rotate: 0 }} transition={{ duration: 0.82, ease: 'easeOut' }}>
                  <Heart className={`w-4 h-4 ${wishlist.length ? 'fill-red-500 text-red-500' : ''}`} />
                </motion.span>
                {wishlist.length > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{wishlist.length}</span>}
              </button>
              <AnimatePresence>
                {wishlistOpen && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="fixed top-20 inset-x-3 mx-auto w-auto max-w-sm max-h-[calc(100dvh-6rem)] overflow-y-auto lg:top-24 lg:left-auto lg:right-4 lg:mx-0 lg:w-80 lg:max-w-none rounded-xl bg-white p-3 text-[#1e1f22] shadow-xl border border-charcoal-100 z-[70]" dir={language === 'en' ? 'ltr' : 'rtl'}>
                  <h3 className="font-bold text-[#1e1f22] mb-2">{t('wishlist')}</h3>
                  {!wishlist.length ? <p className="py-5 text-center text-sm text-[#68695d]">{t('emptyWishlist')}</p> : <div className="max-h-72 overflow-y-auto">{wishlist.map((product, index) => <div key={product.id}><div className="flex items-center gap-2 rounded-xl p-1.5 text-[#292c23] hover:bg-moon-face-100"><StoredMedia type="image" source={product.image} alt={product.name} className="h-12 w-10 rounded-lg object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[#292c23]">{language === 'ar' ? product.nameAr : product.name}</p><p className="text-xs text-[#535449]">{t('color')}: {translateProductColor(product.selectedColor || product.colorName, language)}</p><p className="mt-1 text-xs font-bold text-[#292c23]">{t('price')}: ₪{product.price}</p></div><button onClick={() => onToggleWishlist(product, product.selectedColor || product.colorName)} className="p-2 text-red-500 transition-transform hover:scale-110" aria-label={t('removeWishlist')}><Heart size={16} className="fill-current" /></button></div>{index < wishlist.length - 1 && <div className="my-3 h-px w-full bg-[#a56c4f]" aria-hidden="true" />}</div>)}</div>}
                </motion.div>}
              </AnimatePresence>
            </div>

          </div>
        </div>
      </motion.nav>
    </>
  );
}