import type { CSSProperties } from 'react';
import { Tag } from 'lucide-react';
import { ProductCard } from './ProductShowcase';
import type { Product } from '../data/products';
import type { WishlistItem } from '../App';
import { useLanguage } from '../i18n';

function selectProduct(productId: number) {
  document.dispatchEvent(new CustomEvent('moon-face:select-product', { detail: productId }));
}

export default function SpecialOffers({ products, onAdd, wishlist = [], onToggleWishlist, onRequireAuth }: { products: Product[]; onAdd: (product: Product, color: string) => void; wishlist?: WishlistItem[]; onToggleWishlist: (product: Product, color: string) => void; onRequireAuth: () => void }) {
  const { language, t } = useLanguage();
  const offers = products.filter((product) => product.originalPrice > product.price);
  if (!offers.length) return null;

  return <section aria-label={t('offersTitle')} className="overflow-hidden bg-[#3B2A22]/94 py-5 text-white sm:py-7" dir={language === 'en' ? 'ltr' : 'rtl'}>
    <div className="mx-auto mb-4 flex max-w-7xl items-end justify-between gap-4 px-4 sm:px-6 lg:px-8"><h2 className="flex items-center gap-2 text-3xl font-extrabold sm:text-4xl"><Tag size={22} className="text-moon-face-300" />{t('offersTitle')}</h2><span className="hidden text-sm text-white/65 sm:block">{t('offersHint')}</span></div>
    <div className="offers-viewport"><div className="offers-track" style={{ '--offer-duration': `${Math.max(28, offers.length * 8)}s` } as CSSProperties}>
      {[0, 1].map((copy) => offers.map((product, index) => <div key={`${copy}-${product.id}`} className="offer-item"><ProductCard product={product} index={index} onAdd={onAdd} liked={wishlist.some((item) => item.id === product.id)} onToggleWishlist={onToggleWishlist} selected={false} onSelect={selectProduct} onRequireAuth={onRequireAuth} animateOnView={false} variant="offer" /></div>))}
    </div></div>
  </section>;
}
