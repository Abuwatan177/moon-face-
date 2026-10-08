import Navbar from './components/Navbar';
import EditorialHero from './components/EditorialHero';
import Collections from './components/Collections';
import Benefits from './components/Benefits';
import Footer from './components/Footer';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingBag } from 'lucide-react';
import ProductShowcase from './components/ProductShowcase';
import ReelsSection from './components/ReelsSection';
import FeedbackSection from './components/FeedbackSection';
import LiveSocialProof from './components/LiveSocialProof';
import ScrollToTopButton from './components/ScrollToTopButton';
import PullToRefresh from './components/PullToRefresh';
import SpecialOffers from './components/SpecialOffers';
import CartDrawer, { type CartItem } from './components/CartDrawer';
import SpinWheel from './components/SpinWheel';
import AccountPanel from './components/AccountPanel';
import { useAuth } from './context/AuthContext';
import { defaultProducts, type Product } from './data/products';
import { clearAbandonedCartSession, deleteStoredMedia, loadArchivedProducts, loadProducts, loadSiteContent, saveProducts as persistProducts, saveSiteContent as persistSiteContent, trackCartSession } from './lib/api';
import { defaultSiteContent, type SiteContent } from './data/siteContent';
import { normalizeProductType, useLanguage } from './i18n';
import { playStoreSound } from './utils/storeSounds';

export type WishlistItem = Product & { selectedColor: string };

function isRetiredBundledMedia(source: string) {
  try {
    const pathname = new URL(source, 'https://moon-face.invalid').pathname;
    return /^\/media\/hijab-[^/]+\.(?:jpe?g|mp4)$/i.test(pathname) || pathname === '/media/moon-face-logo.svg';
  } catch {
    return false;
  }
}

const normalizeProducts = (items: unknown): Product[] => {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item): item is Partial<Product> => Boolean(item && typeof item === 'object'))
    .map((product) => {
      const images = Array.isArray(product.images)
        ? product.images.filter((image): image is { color: string; img: string } => Boolean(image?.img) && !isRetiredBundledMedia(image.img))
        : [];
      const colors = Array.isArray(product.colors)
        ? product.colors.filter((color): color is Product['colors'][number] => Boolean(color?.name)).map((color) => ({
          ...color,
          image: isRetiredBundledMedia(color.image) ? '' : color.image,
          images: (color.images || []).filter((image) => !isRetiredBundledMedia(image)),
          media: color.media?.filter((media) => !isRetiredBundledMedia(media.url)),
        }))
        : images.map((image) => ({ name: image.color, available: true, image: image.img }));
      const image = (product.image && !isRetiredBundledMedia(product.image) ? product.image : '') || images[0]?.img || colors[0]?.image || '';
      const storedProductType = typeof product.productType === 'string' ? product.productType.trim() : '';
      const knownDefaultProduct = defaultProducts.find((item) => item.id === Number(product.id) && item.name === product.name);
      const productType = (!storedProductType || normalizeProductType(storedProductType) === 'hijabs') && knownDefaultProduct
        ? knownDefaultProduct.productType
        : storedProductType || undefined;

      return {
        ...product,
        id: Number(product.id),
        name: String(product.name || `Product ${product.id || ''}`).trim(),
        nameAr: String(product.nameAr || product.name || '').trim(),
        category: String(product.category || product.name || '').trim(),
        productType,
        image,
        images: images.length ? images : image ? [{ color: product.colorName || '', img: image }] : [],
        media: Array.isArray(product.media)
          ? product.media.filter((media): media is NonNullable<Product['media']>[number] => Boolean(media && (media.type === 'image' || media.type === 'video') && media.url) && !isRetiredBundledMedia(media.url))
          : [],
        colors,
        sizes: [],
      } as Product;
    })
    .filter((product) => Number.isFinite(product.id));
};

function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function restoreCart(): CartItem[] {
  const stored = readStored<Array<CartItem & { selectedSize?: string }>>('moon-face-cart', []);
  const lines = new Map<string, CartItem>();
  stored.forEach(({ selectedSize: _selectedSize, ...item }) => {
    const lineId = `${item.id}:${item.selectedColor}`;
    const existing = lines.get(lineId);
    lines.set(lineId, { ...item, lineId, quantity: (existing?.quantity || 0) + item.quantity });
  });
  return [...lines.values()];
}

function restoreWishlist(): WishlistItem[] {
  return readStored<Array<WishlistItem & { selectedSize?: string }>>('moon-face-wishlist', [])
    .map(({ selectedSize: _selectedSize, ...item }) => item);
}

function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
  }
}

function readInitialProducts(): Product[] {
  const cached = readStored<unknown | undefined>('moon-face-products-cache', undefined);
  if (cached !== undefined) return normalizeProducts(cached).filter((product) => product.isArchived !== true);
  const catalog = readStored<unknown | undefined>('moon-face-products', undefined);
  if (catalog !== undefined) return normalizeProducts(catalog).filter((product) => product.isArchived !== true);
  return normalizeProducts(defaultProducts).sort((first, second) => second.id - first.id);
}

function readCartSessionId() {
  const saved = readStored<string | null>('moon-face-cart-session-id', null);
  if (saved) return saved;
  const sessionId = crypto.randomUUID();
  writeStored('moon-face-cart-session-id', sessionId);
  return sessionId;
}

function collectStoredMedia(value: unknown, media = new Set<string>()): Set<string> {
  if (typeof value === 'string' && (value.startsWith('local-media:') || value.includes('/storage/v1/object/public/store-media/'))) media.add(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStoredMedia(item, media));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectStoredMedia(item, media));
  return media;
}

const mergeSiteContent = (value: Partial<SiteContent> | null | undefined): SiteContent => {
  const productTypes = Array.isArray(value?.productTypes)
    ? value.productTypes.filter((type): type is string => typeof type === 'string' && type.trim().length > 0)
      .filter((type) => normalizeProductType(type) !== 'hijabs')
    : [];
  const savedHeroMedia = Array.isArray(value?.hero?.media)
    ? value.hero.media.filter((media) => (media.type === 'image' || media.type === 'video') && Boolean(media.url) && !isRetiredBundledMedia(media.url))
    : [];
  const savedTutorialEntries = Array.isArray(value?.tutorials?.entries)
    ? value.tutorials.entries.filter((entry) => (entry.type === 'image' || entry.type === 'video') && Boolean(entry.url) && !isRetiredBundledMedia(entry.url))
      .map((entry) => ({ ...entry, title: String(entry.title || ''), description: String(entry.description || '') }))
    : [];
  const tutorialsConfigured = value?.tutorialsConfigured === true;
  const tutorialEntries = tutorialsConfigured || savedTutorialEntries.length
    ? savedTutorialEntries
    : defaultSiteContent.tutorials.entries;
  const savedReelsEntries = Array.isArray(value?.reels?.entries)
    ? value.reels.entries.filter((entry) => Boolean(entry?.url) && !isRetiredBundledMedia(entry.url) && Number.isFinite(Number(entry.productId)))
      .map((entry) => ({ id: String(entry.id || entry.url), url: String(entry.url), productId: Number(entry.productId), caption: String(entry.caption || '') }))
    : [];
  const reelsConfigured = value?.reelsConfigured === true;
  const reelsEntries = reelsConfigured || savedReelsEntries.length ? savedReelsEntries : defaultSiteContent.reels.entries;
  const heroImage = value?.hero?.image && !isRetiredBundledMedia(value.hero.image) ? value.hero.image : defaultSiteContent.hero.image;
  const heroMedia = savedHeroMedia.length
    ? [...savedHeroMedia]
    : heroImage ? [{ type: 'image' as const, url: heroImage }] : [];
  if (!heroMedia.some((media) => media.type === 'image') && heroImage) heroMedia.unshift({ type: 'image', url: heroImage });

  return {
    ...defaultSiteContent,
    ...(value && typeof value === 'object' ? value : {}),
    offersEnabled: value?.offersEnabledConfigured === true ? value.offersEnabled === true : defaultSiteContent.offersEnabled,
    offersEnabledConfigured: value?.offersEnabledConfigured === true,
    productTypes: productTypes.length ? productTypes : defaultSiteContent.productTypes,
    storeLogo: typeof value?.storeLogo === 'string' && !isRetiredBundledMedia(value.storeLogo) ? value.storeLogo : defaultSiteContent.storeLogo,
    whatsappNumber: typeof value?.whatsappNumber === 'string' ? value.whatsappNumber : defaultSiteContent.whatsappNumber,
    feedbackEmail: typeof value?.feedbackEmail === 'string' ? value.feedbackEmail.trim() : defaultSiteContent.feedbackEmail,
    tutorialsConfigured,
    reelsConfigured,
    tutorials: {
      ...defaultSiteContent.tutorials,
      ...(value?.tutorials && typeof value.tutorials === 'object' ? value.tutorials : {}),
      title: value?.tutorials?.title || defaultSiteContent.tutorials.title,
      entries: tutorialEntries,
    },
    reels: {
      ...defaultSiteContent.reels,
      ...(value?.reels && typeof value.reels === 'object' ? value.reels : {}),
      title: value?.reels?.title || defaultSiteContent.reels.title,
      entries: reelsEntries,
    },
    policies: {
      ...defaultSiteContent.policies,
      ...(value?.policies && typeof value.policies === 'object' ? value.policies : {}),
    },
    hero: {
      ...defaultSiteContent.hero,
      ...(value?.hero && typeof value.hero === 'object' ? value.hero : {}),
      eyebrow: value?.hero?.eyebrow || defaultSiteContent.hero.eyebrow,
      titleLine1: value?.hero?.titleLine1 || defaultSiteContent.hero.titleLine1,
      titleLine2: value?.hero?.titleLine2 || defaultSiteContent.hero.titleLine2,
      titleLine3: value?.hero?.titleLine3 || defaultSiteContent.hero.titleLine3,
      description: value?.hero?.description || defaultSiteContent.hero.description,
      primaryButton: value?.hero?.primaryButton || defaultSiteContent.hero.primaryButton,
      image: heroImage,
      media: heroMedia,
    },
    story: {
      ...defaultSiteContent.story,
      ...(value?.story && typeof value.story === 'object' ? value.story : {}),
      eyebrow: value?.story?.eyebrow || defaultSiteContent.story.eyebrow,
      title: value?.story?.title || defaultSiteContent.story.title,
      highlight: value?.story?.highlight || defaultSiteContent.story.highlight,
      description: value?.story?.description || defaultSiteContent.story.description,
      image: value?.story?.image && !isRetiredBundledMedia(value.story.image) ? value.story.image : defaultSiteContent.story.image,
      secondaryImage: value?.story?.secondaryImage && !isRetiredBundledMedia(value.story.secondaryImage) ? value.story.secondaryImage : defaultSiteContent.story.secondaryImage,
      features: Array.isArray(value?.story?.features) && value.story.features.length
        ? value.story.features
        : defaultSiteContent.story.features,
    },
    collections: Array.isArray(value?.collections)
      ? value.collections.filter((collection) => !isRetiredBundledMedia(collection.image))
      : defaultSiteContent.collections,
  };
};

export default function App() {
  const { language, t } = useLanguage();
  const { user,isGuest } = useAuth();
  const [products, setProducts] = useState<Product[]>(readInitialProducts);
  const [cart, setCart] = useState<CartItem[]>(restoreCart);
  const hadCartItems = useRef(cart.length > 0);
  const [cartSessionId] = useState(readCartSessionId);
  const [cartOpen, setCartOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [wishlist, setWishlist] = useState<WishlistItem[]>(restoreWishlist);
  const [siteContent, setSiteContent] = useState<SiteContent>(() => mergeSiteContent(readStored<Partial<SiteContent>>('moon-face-site-content', {})));

  useEffect(() => {
    writeStored('moon-face-cart', cart);
  }, [cart]);
  useEffect(() => {
    if (cart.length) {
      void trackCartSession(cartSessionId, cart.map((item) => ({ id: item.id, name: item.name, color: item.selectedColor, price: item.price, quantity: item.quantity })));
    } else if (hadCartItems.current) {
      void clearAbandonedCartSession(cartSessionId);
    }
    hadCartItems.current = cart.length > 0;
  }, [cart, cartSessionId, user?.id]);
  useEffect(() => {
    writeStored('moon-face-wishlist', wishlist);
  }, [wishlist]);
  useEffect(() => {
    writeStored('moon-face-products-cache', products);
  }, [products]);
  useEffect(() => {
    writeStored('moon-face-site-content', siteContent);
  }, [siteContent]);
  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryAttempt = 0;
    let loading = false;
    let lastRefreshAt = 0;

    const refresh = async () => {
      if (!active || loading || !navigator.onLine) return;
      loading = true;
      lastRefreshAt = Date.now();
      const [productsResult, contentResult] = await Promise.allSettled([loadProducts(), loadSiteContent()]);
      loading = false;
      if (!active) return;

      if (productsResult.status === 'fulfilled') {
        const catalog = normalizeProducts(productsResult.value ?? defaultProducts);
        const availableCatalog = productsResult.value === null ? defaultProducts : catalog;
        const hasDisplayOrder = availableCatalog.length > 0 && availableCatalog.every((product) => Number.isFinite(product.displayOrder));
        const restored = availableCatalog
          .sort((a, b) => hasDisplayOrder
            ? (a.displayOrder || 0) - (b.displayOrder || 0)
            : Number(b.id) - Number(a.id))
          .map((product, index) => ({ ...product, displayOrder: hasDisplayOrder ? product.displayOrder : index }));
        setProducts(restored);
      }

      if (contentResult.status === 'fulfilled') {
        setSiteContent(mergeSiteContent(contentResult.value));
      }

      if (productsResult.status === 'rejected' || contentResult.status === 'rejected') {
        retryAttempt += 1;
        const delay = Math.min(5000 * 2 ** Math.min(retryAttempt - 1, 6), 300000) + Math.random() * 1000;
        retryTimer = setTimeout(() => void refresh(), delay);
        return;
      }

      retryAttempt = 0;
    };

    const refreshWhenOnline = () => {
      if (!navigator.onLine || Date.now() - lastRefreshAt < 60_000) return;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = undefined;
      retryAttempt = 0;
      void refresh();
    };

    window.addEventListener('online', refreshWhenOnline);
    void refresh();

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener('online', refreshWhenOnline);
    };
  }, []);
  const addToCart = (product: Product, selectedColor: string) => {
    const selectedColorData = product.colors?.find((color) => color.name === selectedColor);
    const colorAvailable = selectedColorData?.available ?? true;
    if (!selectedColor || !colorAvailable) return;
    playStoreSound('cart');

    const lineId = `${product.id}:${selectedColor}`;
    const selectedImage = selectedColorData?.image || product.image;
    setCart((items) => {
      const existing = items.find((item) => item.lineId === lineId);
      return existing
        ? items.map((item) => item.lineId === lineId ? { ...item, quantity: item.quantity + 1 } : item)
        : [...items, { ...product, image: selectedImage, quantity: 1, selectedColor, lineId }];
    });
    document.dispatchEvent(new Event('moon-face:cart-added'));
  };
  const changeQuantity = (lineId: string, delta: number) => setCart((items) => items.map((item) => item.lineId === lineId ? { ...item, quantity: item.quantity + delta } : item).filter((item) => item.quantity > 0));
  const saveProducts = async (next: Product[] = products) => {
    const ordered = normalizeProducts(next).map((product, index) => ({ ...product, displayOrder: index }));
    const previousMedia = collectStoredMedia(products);
    const saved = await persistProducts(ordered);
    const archivedProducts = await loadArchivedProducts();
    const retainedMedia = collectStoredMedia([...ordered, ...archivedProducts]);
    await Promise.all([...previousMedia].filter((url) => !retainedMedia.has(url)).map(deleteStoredMedia));
    const savedOrdered = normalizeProducts(saved).sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    setProducts(savedOrdered);
  };
  const saveSiteContent = async (next: SiteContent) => {
    const merged = mergeSiteContent(next);
    await persistSiteContent(merged);
    const previousMedia = collectStoredMedia(siteContent);
    const retainedMedia = collectStoredMedia(merged);
    await Promise.all([...previousMedia].filter((url) => !retainedMedia.has(url)).map(deleteStoredMedia));
    setSiteContent(merged);
  };
  const toggleWishlist = (product: Product, selectedColor: string) => {
    const isAdding = !wishlist.some((item) => item.id === product.id);
    if (isAdding) playStoreSound('like');
    setWishlist((current) => current.some((item) => item.id === product.id)
      ? current.filter((item) => item.id !== product.id)
      : [...current, { ...product, selectedColor }]);
    if (isAdding) document.dispatchEvent(new Event('moon-face:wishlist-added'));
  };
  return (
    <div className="min-h-screen relative isolate">
      <div className="store-fabric-backdrop" aria-hidden="true"><div className="store-fabric-sheet store-fabric-sheet-left" /><div className="store-fabric-sheet store-fabric-sheet-right" /></div>
      <div className="relative z-[1]">
      <div aria-hidden="true" className="store-loader-screen fixed inset-0 z-[100] grid place-items-center bg-[#3B2A22] text-[#f6f3e8]">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="flex flex-col items-center gap-5">
            <img src={siteContent.storeLogo} alt="Moon Face" className="w-44 sm:w-56" />
            <span className="h-1 w-36 overflow-hidden rounded-full bg-white/15"><motion.span initial={{ width: '12%' }} animate={{ width: '100%' }} transition={{ duration: 0.52, ease: 'easeInOut' }} className="block h-full rounded-full bg-[#b9bc93]" /></span>
          </motion.div>
      </div>
      <Navbar
        products={products}
        storeLogo={siteContent.storeLogo}
        onCartOpen={() => setCartOpen(true)}
        onAccountOpen={() => setAccountOpen(true)}
        isSignedIn={Boolean(user)}
        isGuest={isGuest}
        cartCount={cart.reduce((sum, item) => sum + item.quantity, 0)}
        wishlist={wishlist}
        onToggleWishlist={toggleWishlist}
      />
      <EditorialHero key={language} content={siteContent.hero} featuredImage={products[0]?.image} language={language} />
      {siteContent.offersEnabled && <SpecialOffers products={products} onAdd={addToCart} wishlist={wishlist} onToggleWishlist={toggleWishlist} onRequireAuth={() => setAccountOpen(true)} />}
      <ProductShowcase products={products} productTypes={siteContent.productTypes} tutorials={siteContent.tutorials} onAdd={addToCart} wishlist={wishlist} onToggleWishlist={toggleWishlist} onRequireAuth={() => setAccountOpen(true)} />
      {siteContent.collections.length > 0 && <Collections collections={siteContent.collections} onSelectCollection={() => document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' })} />}
      <ReelsSection entries={siteContent.reels.entries} products={products} onRequireAuth={() => setAccountOpen(true)} />
      <FeedbackSection recipient={siteContent.feedbackEmail} />
      <LiveSocialProof products={products} paused={cartOpen || accountOpen} />
      {Object.values(siteContent.story).some((value) => typeof value === 'string' ? value.trim() : Array.isArray(value) && value.length > 0) && <Benefits content={siteContent.story} />}
      <Footer policies={siteContent.policies} />
      <button onClick={() => setCartOpen(true)} className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-[#563C2E] text-white shadow-xl flex items-center justify-center hover:scale-110 hover:bg-moon-face-800 transition-all duration-300" aria-label={t('openCart')}>
        <ShoppingBag className="w-6 h-6" />
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#f6f3e8] bg-[#a56c4f] px-1 text-xs font-bold leading-none text-white shadow-sm">{cart.reduce((sum, item) => sum + item.quantity, 0)}</span>
      </button>
      <CartDrawer open={cartOpen} items={cart} sessionId={cartSessionId} whatsappNumber={siteContent.whatsappNumber} onClose={() => setCartOpen(false)} onChange={changeQuantity} onClear={() => setCart([])} />
      <SpinWheel />
      <ScrollToTopButton />
      <PullToRefresh />
      <AccountPanel open={accountOpen} products={products} siteContent={siteContent} onSaveProducts={saveProducts} onSaveSiteContent={saveSiteContent} onClose={() => setAccountOpen(false)} />
      </div>
    </div>
  );
}