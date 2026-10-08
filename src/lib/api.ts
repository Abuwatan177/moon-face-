type ProductInteractionComment = { product_id: number; body: string; created_at: string };
type ProductInteractions = { likes: Set<number>; saves: Set<number>; comments: ProductInteractionComment[] };
type ProductInteractionWaiter = { productIds: number[]; resolve: (value: ProductInteractions) => void; reject: (error: unknown) => void };
type ProductInteractionBatch = { productIds: Set<number>; waiters: ProductInteractionWaiter[]; scheduled: boolean };
import type { Product } from '../data/products';
import type { SiteContent } from '../data/siteContent';
import { deleteLocalMedia, saveLocalMedia } from './localMedia';
import { subscribeWithOneSignal } from './oneSignal';
import { supabase } from './supabase';

export type StoreOrder = {
  id: number;
  customer: { name: string; email: string; phone: string; address: string };
  region: string;
  items: { id: number; name: string; color: string; size?: string; price: number; quantity: number }[];
  subtotal: number;
  discount: number;
  promoCode: string;
  deliveryFee: number;
  total: number;
  status: string;
  createdAt: string;
};

export type ProductComment = { id: string; product_id: number; user_id?: string | null; display_name: string; body: string; rating: number | null; created_at: string };
export type TrackedOrder = {
  id: number;
  customer: { name: string; phone: string; address: string };
  region: string;
  items: StoreOrder['items'];
  subtotal: number;
  discount: number;
  promoCode: string;
  deliveryFee: number;
  status: string;
  createdAt: string;
  total: number;
};
export type LoyaltyCampaign = { id: string; label: string; matchField: 'productType' | 'category' | 'name'; matchValue: string; multiplier: number; startsAt?: string; endsAt?: string };
export type LoyaltyConfig = { pointsPerCurrency: number; currencyValuePerPoint: number; campaigns: LoyaltyCampaign[] };
export type WheelRewardType = 'discount' | 'points' | 'none';
export type WheelSlice = { id: string; label: string; probability: number; rewardType: WheelRewardType; rewardValue: number; color: string };
export type WheelConfig = { enabled: boolean; slices: WheelSlice[] };
export type WheelSpinResult = { spinId: string; prize: WheelSlice; rewardCode: string | null; alreadySpun: boolean };

const defaultLoyaltyConfig: LoyaltyConfig = { pointsPerCurrency: 1, currencyValuePerPoint: 0.01, campaigns: [] };
const defaultWheelConfig: WheelConfig = {
  enabled: false,
  slices: [
    { id: 'welcome', label: 'خصم 10%', probability: 25, rewardType: 'discount', rewardValue: 10, color: '#a56c4f' },
    { id: 'points', label: '50 نقطة', probability: 25, rewardType: 'points', rewardValue: 50, color: '#5e6d49' },
    { id: 'try-again', label: 'حظ أوفر', probability: 25, rewardType: 'none', rewardValue: 0, color: '#c5a875' },
    { id: 'gift', label: 'خصم 20%', probability: 25, rewardType: 'discount', rewardValue: 20, color: '#563C2E' },
  ],
};
function resolveBackendUrl() {
  const fallback = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin;
  const configured = import.meta.env.VITE_BACKEND_URL?.trim();
  if (!configured) return fallback;

  try {
    const configuredUrl = new URL(configured);
    if (configuredUrl.hostname === 'supabase.co' || configuredUrl.hostname.endsWith('.supabase.co')) return fallback;
    return configuredUrl.origin;
  } catch {
    return fallback;
  }
}

const backendUrl = resolveBackendUrl().replace(/\/+$/, '');

function isBackendUnavailableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Failed to fetch|ERR_CONNECTION_REFUSED|NetworkError|load failed|fetch failed/i.test(message);
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

type ReadCacheEntry = { value: unknown; expiresAt: number };
const READ_CACHE_TTL_MS = 60_000;
const PUBLIC_DATA_CACHE_TTL_MS = 15 * 60_000;
const persistentCacheKeys: Record<string, string> = {
  'products:public': 'moon-face-cache:products:public',
  'settings:site-content': 'moon-face-cache:settings:site-content',
};
const persistentCacheSource = import.meta.env.VITE_SUPABASE_URL?.trim() || 'local';
const MAX_READ_CACHE_ENTRIES = 100;
const readCache = new Map<string, ReadCacheEntry>();
const inFlightReads = new Map<string, Promise<unknown>>();
const readCacheGenerations = new Map<string, number>();
let readCacheGeneration = 0;

type PersistedReadCache = { source: string; updatedAt: number; value: unknown };

function readPersistedCache<T>(key: string) {
  const storageKey = persistentCacheKeys[key];
  if (!storageKey) return null;
  const cached = readLocal<PersistedReadCache | null>(storageKey, null);
  if (!cached || cached.source !== persistentCacheSource || !Number.isFinite(cached.updatedAt)) return null;
  return { value: cached.value as T, updatedAt: cached.updatedAt };
}

function writePersistedCache(key: string, value: unknown, updatedAt = Date.now()) {
  const storageKey = persistentCacheKeys[key];
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify({ source: persistentCacheSource, updatedAt, value }));
  } catch {
    // Cached copies are optional; the database remains the source of truth.
  }
}

function rememberReadCache(key: string, value: unknown, ttl: number) {
  const updatedAt = Date.now();
  readCache.set(key, { value, expiresAt: updatedAt + ttl });
  writePersistedCache(key, value, updatedAt);
}

function invalidateReadCache(key: string, clearPersisted = true) {
  readCache.delete(key);
  if (inFlightReads.has(key)) {
    readCacheGenerations.set(key, ++readCacheGeneration);
    inFlightReads.delete(key);
  }
  if (clearPersisted) {
    const storageKey = persistentCacheKeys[key];
    if (storageKey) {
      try { localStorage.removeItem(storageKey); } catch { /* Storage may be unavailable. */ }
    }
  }
}

function invalidateReadCachePrefix(prefix: string) {
  const keys = new Set([...readCache.keys(), ...inFlightReads.keys()]);
  keys.forEach((key) => { if (key.startsWith(prefix)) invalidateReadCache(key); });
}

function cachedRead<T>(key: string, load: () => Promise<T>, ttl = READ_CACHE_TTL_MS): Promise<T> {
  const now = Date.now();
  const cached = readCache.get(key);
  if (cached && cached.expiresAt > now) return Promise.resolve(cached.value as T);
  if (cached) readCache.delete(key);
  const pending = inFlightReads.get(key);
  if (pending) return pending as Promise<T>;

  const persisted = readPersistedCache<T>(key);
  if (persisted) {
    const expiresAt = persisted.updatedAt + ttl;
    if (expiresAt > now) {
      readCache.set(key, { value: persisted.value, expiresAt });
      return Promise.resolve(persisted.value);
    }
  }

  const generation = readCacheGenerations.get(key) || 0;
  const request = Promise.resolve().then(load).then((value) => {
    if ((readCacheGenerations.get(key) || 0) === generation) {
      const cacheNow = Date.now();
      for (const [cacheKey, entry] of readCache) {
        if (entry.expiresAt <= cacheNow) readCache.delete(cacheKey);
      }
      while (readCache.size >= MAX_READ_CACHE_ENTRIES) {
        const oldestKey = readCache.keys().next().value;
        if (oldestKey === undefined) break;
        readCache.delete(oldestKey);
      }
      readCache.set(key, { value, expiresAt: cacheNow + ttl });
      writePersistedCache(key, value, cacheNow);
    }
    return value;
  }).catch((error) => {
    if (!persisted || !isBackendUnavailableError(error)) throw error;
    if ((readCacheGenerations.get(key) || 0) === generation) {
      readCache.set(key, { value: persisted.value, expiresAt: Date.now() + ttl });
    }
    return persisted.value;
  }).finally(() => {
    if (inFlightReads.get(key) === request) inFlightReads.delete(key);
    if (!inFlightReads.has(key)) readCacheGenerations.delete(key);
  });
  inFlightReads.set(key, request);
  return request;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    const entry = Object.entries(persistentCacheKeys).find(([, storageKey]) => storageKey === event.key);
    if (entry) invalidateReadCache(entry[0], false);
  });
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error('Local storage is unavailable');
  }
}

function createTrackingToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function orderFromRow(row: any): StoreOrder {
  return {
    ...row.payload,
    id: Number(row.id ?? row.order_number),
    customer: { name: row.customer_name, email: row.customer_email || '', phone: row.customer_phone || '', address: row.customer_address || '' },
    region: row.region,
    status: row.status,
    createdAt: row.created_at,
  };
}

function invalidateOrderCaches() {
  invalidateReadCache('orders:owner');
  invalidateReadCachePrefix('orders:user:');
}

async function readProductCatalog(): Promise<Product[]> {
  if (supabase) {
    const { data, error } = await supabase.from('store_settings').select('value').eq('key', 'products').maybeSingle();
    if (error) throw error;
    return (Array.isArray(data?.value) ? data.value : []) as Product[];
  }
  return readLocal<Product[]>('moon-face-products', []);
}

async function writeProductCatalog(products: Product[]): Promise<Product[]> {
  if (supabase) {
    const { data, error } = await supabase.from('store_settings').upsert({ key: 'products', value: products, updated_at: new Date().toISOString() }).select('value').single();
    if (error) throw error;
    invalidateReadCache('products:archived');
    invalidateReadCache('products:public');
    return (Array.isArray(data?.value) ? data.value : products) as Product[];
  }
  writeLocal('moon-face-products', products);
  invalidateReadCache('products:archived');
  invalidateReadCache('products:public');
  return products;
}

export async function loadProducts(): Promise<Product[] | null> {
  return cachedRead('products:public', async () => {
    if (supabase) {
      const { data, error } = await supabase.rpc('get_public_products');
      if (error) throw error;
      if (data === null) return null;
      return (Array.isArray(data) ? data : []) as Product[];
    }
    const catalog = readLocal<Product[] | null>('moon-face-products', null);
    return catalog === null ? null : catalog.filter((product) => product.isArchived !== true);
  }, PUBLIC_DATA_CACHE_TTL_MS);
}

export async function loadArchivedProducts(): Promise<Product[]> {
  return cachedRead('products:archived', async () => (await readProductCatalog()).filter((product) => product.isArchived === true));
}

function productMediaUrls(product: Product) {
  return [...new Set([
    product.image,
    ...(product.images || []).map((image) => image.img),
    ...(product.colors || []).flatMap((color) => [color.image, ...(color.images || []), ...(color.media || []).map((media) => media.url)]),
    ...(product.media || []).map((media) => media.url),
  ].filter((url): url is string => typeof url === 'string' && url.length > 0))];
}

export async function saveProducts(products: Product[]) {
  const existing = await readProductCatalog();
  const active = products.map((product, displayOrder) => ({ ...product, isArchived: false, displayOrder }));
  const activeIds = new Set(active.map((product) => product.id));
  const archived = existing
    .filter((product) => !activeIds.has(product.id))
    .map((product) => ({ ...product, isArchived: true }));
  const saved = await writeProductCatalog([...active, ...archived]);
  const activeProducts = saved.filter((product) => product.isArchived !== true);
  rememberReadCache('products:public', activeProducts, PUBLIC_DATA_CACHE_TTL_MS);
  return activeProducts;
}

export async function permanentlyDeleteArchivedProduct(productId: number) {
  const catalog = await readProductCatalog();
  const target = catalog.find((product) => product.id === productId);
  if (!target || target.isArchived !== true) throw new Error('لا يمكن حذف منتج غير مؤرشف.');
  const remaining = catalog.filter((product) => product.id !== productId);
  const retainedMedia = new Set(remaining.flatMap(productMediaUrls));
  const unusedMedia = productMediaUrls(target).filter((url) => !retainedMedia.has(url));
  await writeProductCatalog(remaining);
  const cleanupResults = await Promise.allSettled(unusedMedia.map(deleteStoredMedia));
  if (cleanupResults.some((result) => result.status === 'rejected')) {
    console.error('Product was deleted, but one or more media files could not be removed.');
  }
}

export async function loadSiteContent(): Promise<Partial<SiteContent>> {
  return cachedRead('settings:site-content', async () => {
    if (supabase) {
      const { data, error } = await supabase.from('store_settings').select('value').eq('key', 'site_content').maybeSingle();
      if (error) throw error;
      return (data?.value || {}) as Partial<SiteContent>;
    }
    return readLocal<Partial<SiteContent>>('moon-face-site-content', {});
  }, PUBLIC_DATA_CACHE_TTL_MS);
}

export async function saveSiteContent(content: SiteContent) {
  if (supabase) {
    const { error } = await supabase.from('store_settings').upsert({ key: 'site_content', value: content, updated_at: new Date().toISOString() });
    if (error) throw error;
  } else {
    writeLocal('moon-face-site-content', content);
  }
  invalidateReadCache('settings:site-content');
  rememberReadCache('settings:site-content', content, PUBLIC_DATA_CACHE_TTL_MS);
}

export async function loadLoyaltyConfig(): Promise<LoyaltyConfig> {
  return cachedRead('settings:loyalty-config', async () => {
    if (supabase) {
      const { data, error } = await supabase.from('store_settings').select('value').eq('key', 'loyalty_config').maybeSingle();
      if (error) throw error;
      return { ...defaultLoyaltyConfig, ...(data?.value || {}) } as LoyaltyConfig;
    }
    return { ...defaultLoyaltyConfig, ...readLocal<Partial<LoyaltyConfig>>('moon-face-loyalty-config', {}) };
  });
}

export async function saveLoyaltyConfig(config: LoyaltyConfig) {
  const cleanConfig: LoyaltyConfig = {
    pointsPerCurrency: Math.max(0, Number(config.pointsPerCurrency) || 0),
    currencyValuePerPoint: Math.max(0.0001, Number(config.currencyValuePerPoint) || 0.01),
    campaigns: config.campaigns.filter((campaign) => campaign.label.trim() && campaign.matchValue.trim() && Number(campaign.multiplier) >= 1),
  };
  if (supabase) {
    const { error } = await supabase.from('store_settings').upsert({ key: 'loyalty_config', value: cleanConfig, updated_at: new Date().toISOString() });
    if (error) throw error;
    invalidateReadCache('settings:loyalty-config');
    return;
  }
  writeLocal('moon-face-loyalty-config', cleanConfig);
  invalidateReadCache('settings:loyalty-config');
}

export async function loadLoyaltyBalance(): Promise<number> {
  if (!supabase) return 0;
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = data.session?.user.id;
  if (!userId) return 0;
  return cachedRead(`loyalty-balance:${userId}`, async () => {
    const { data: balance, error } = await supabase.rpc('get_loyalty_balance');
    if (error) throw error;
    return Number(balance) || 0;
  });
}

export async function loadWheelConfig(): Promise<WheelConfig> {
  return cachedRead('settings:wheel-config', async () => {
    if (supabase) {
      const { data, error } = await supabase.from('store_settings').select('value').eq('key', 'wheel_config').maybeSingle();
      if (error) throw error;
      return { ...defaultWheelConfig, ...(data?.value || {}) } as WheelConfig;
    }
    return { ...defaultWheelConfig, ...readLocal<Partial<WheelConfig>>('moon-face-wheel-config', {}) };
  });
}

export async function saveWheelConfig(config: WheelConfig) {
  const slices = config.slices.map((slice) => ({
    ...slice,
    label: slice.label.trim(),
    probability: Number(slice.probability),
    rewardValue: Number(slice.rewardValue),
    color: /^#[0-9a-f]{6}$/i.test(slice.color) ? slice.color : '#5e6d49',
  }));
  const totalProbability = slices.reduce((sum, slice) => sum + slice.probability, 0);
  if (slices.length < 2 || slices.length > 12 || slices.some((slice) => !slice.id || !slice.label || !Number.isFinite(slice.probability) || slice.probability <= 0 || !Number.isFinite(slice.rewardValue) || slice.rewardValue < 0 || (slice.rewardType === 'discount' && slice.rewardValue > 100) || (slice.rewardType === 'points' && (!Number.isInteger(slice.rewardValue) || slice.rewardValue < 1))) || Math.abs(totalProbability - 100) > 0.01) {
    throw new Error('يجب أن تكون احتمالات الشرائح موجبة ومجموعها 100%.');
  }
  const cleanConfig = { enabled: config.enabled, slices };
  if (supabase) {
    const { error } = await supabase.from('store_settings').upsert({ key: 'wheel_config', value: cleanConfig, updated_at: new Date().toISOString() });
    if (error) throw error;
    invalidateReadCache('settings:wheel-config');
    window.dispatchEvent(new Event('moon-face:wheel-config-updated'));
    return;
  }
  writeLocal('moon-face-wheel-config', cleanConfig);
  invalidateReadCache('settings:wheel-config');
  window.dispatchEvent(new Event('moon-face:wheel-config-updated'));
}

export async function spinWheel(visitorId: string): Promise<WheelSpinResult> {
  if (!supabase) throw new Error('يجب إعداد Supabase لتشغيل السحب.');
  const { data, error } = await supabase.rpc('spin_wheel', { p_visitor_id: visitorId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    spinId: String(row.spin_id),
    prize: row.prize as WheelSlice,
    rewardCode: row.reward_code ? String(row.reward_code) : null,
    alreadySpun: Boolean(row.already_spun),
  };
}

export async function claimWheelReward(visitorId: string): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc('claim_wheel_reward', { p_visitor_id: visitorId });
  if (error) throw error;
  const claimedPoints = Number(data) || 0;
  if (claimedPoints > 0) invalidateReadCachePrefix('loyalty-balance:');
  return claimedPoints;
}

export async function validateWheelCoupon(code: string): Promise<number> {
  if (!supabase) throw new Error('تعذر التحقق من كود الجائزة الآن.');
  const { data, error } = await supabase.rpc('validate_wheel_coupon', { p_code: code.trim() });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return Number(row?.discount_percent ?? row) || 0;
}

export function getProductShareUrl(productId: number) {
  const shareUrl = new URL('/', window.location.origin);
  shareUrl.searchParams.set('product', String(productId));
  return shareUrl.href;
}

export async function saveOrder(order: Record<string, any>) {
  if (supabase) {
    const customer = order.customer || {};
    const { data, error } = await supabase.rpc('create_store_order', {
      p_payload: order,
      p_customer_name: String(customer.name || ''),
      p_customer_phone: String(customer.phone || ''),
      p_customer_address: String(customer.address || ''),
      p_region: String(order.region || ''),
      p_loyalty_points_to_redeem: Number(order.loyaltyPointsRedeemed || 0),
    });
    if (error) throw error;
    if (Number(order.loyaltyPointsRedeemed) > 0) invalidateReadCachePrefix('loyalty-balance:');
    invalidateOrderCaches();
    const result = Array.isArray(data) ? data[0] : data;
    return { orderNumber: Number(result.order_number), trackingToken: String(result.tracking_token) };
  }

  const orders = readLocal<Record<string, any>[]>('moon-face-orders', []);
  const orderNumber = Date.now();
  const trackingToken = createTrackingToken();
  writeLocal('moon-face-orders', [...orders, { ...order, id: orderNumber, trackingToken, status: 'new', createdAt: new Date().toISOString() }]);
  return { orderNumber, trackingToken };
}

export async function sendOrderToShipping(order: Record<string, any>, orderNumber: number) {
  const response = await fetch(`${backendUrl}/api/shipping/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderNumber,
      customer: order.customer,
      region: order.region,
      items: order.items,
      total: order.total,
      product_note: order.product_note || '',
    }),
  });
  if (!response.ok) throw new Error(`Casper shipping request failed (${response.status}).`);
}

async function backendHeaders(sessionId: string) {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  return {
    'Content-Type': 'application/json',
    'X-Cart-Session': sessionId,
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

const CART_TRACKING_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CART_TRACKING_RETRY_MS = 5 * 60 * 1000;
const cartTrackingInFlight = new Set<string>();
const cartCleanupInFlight = new Set<string>();
const cartActionMemory = new Map<string, number>();

function claimDailyCartActionSlot(sessionId: string, action: 'last-tracked' | 'last-cleared', now: number) {
  const key = `moon-face-cart-${action}:${sessionId}`;
  const memoryKey = `${action}:${sessionId}`;
  const lastTrackedAt = Math.max(readLocal<number>(key, 0), cartActionMemory.get(memoryKey) || 0);
  if (now - lastTrackedAt < CART_TRACKING_INTERVAL_MS) return false;

  cartActionMemory.set(memoryKey, now);
  try { writeLocal(key, now); } catch { /* In-memory limiting still applies in restricted storage. */ }
  return true;
}

function deferCartActionRetry(sessionId: string, action: 'last-tracked' | 'last-cleared') {
  const key = `moon-face-cart-${action}:${sessionId}`;
  const memoryKey = `${action}:${sessionId}`;
  const retryAfter = Date.now() + CART_TRACKING_RETRY_MS - CART_TRACKING_INTERVAL_MS;
  cartActionMemory.set(memoryKey, retryAfter);
  try { writeLocal(key, retryAfter); } catch { /* The in-memory cooldown still prevents immediate retries. */ }
}

export async function trackCartSession(sessionId: string, items: { id: number; name: string; color: string; price: number; quantity: number; }[]) {
  if (!items.length || cartTrackingInFlight.has(sessionId)) return;
  const now = Date.now();
  if (!claimDailyCartActionSlot(sessionId, 'last-tracked', now)) return;
  cartTrackingInFlight.add(sessionId);
  let succeeded = false;

  try {
    const response = await fetch(`${backendUrl}/api/cart-sessions`, {
      method: 'POST',
      headers: await backendHeaders(sessionId),
      body: JSON.stringify({ sessionId, items }),
    });

    if (!response.ok) {
      if (response.status >= 500 || response.status === 404) return;
      throw new Error(`Cart session sync failed (${response.status}).`);
    }
    succeeded = true;
  } catch (err: unknown) {
    if (isBackendUnavailableError(err)) return;
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error in trackCartSession:', errorMessage);
  } finally {
    if (!succeeded) deferCartActionRetry(sessionId, 'last-tracked');
    cartTrackingInFlight.delete(sessionId);
  }
}

export async function clearAbandonedCartSession(sessionId: string) {
  if (cartCleanupInFlight.has(sessionId) || !claimDailyCartActionSlot(sessionId, 'last-cleared', Date.now())) return;
  cartCleanupInFlight.add(sessionId);
  let succeeded = false;
  try {
    const response = await fetch(`${backendUrl}/api/cart-sessions`, {
      method: 'DELETE',
      headers: await backendHeaders(sessionId),
    });
    if (!response.ok) throw new Error(`Cart session cleanup failed (${response.status}).`);
    succeeded = true;
  } catch (error) {
    if (isBackendUnavailableError(error)) return;
    if (!(error instanceof Error && /\(4\d\d\)/.test(error.message))) console.warn('Could not clear the abandoned cart session.', error);
  } finally {
    if (!succeeded) deferCartActionRetry(sessionId, 'last-cleared');
    cartCleanupInFlight.delete(sessionId);
  }
}
export async function subscribeToCartReminders(sessionId: string) {
  try {
    const usingOneSignal = Boolean(import.meta.env.VITE_ONESIGNAL_APP_ID?.trim());
    const provider = usingOneSignal
      ? { path: 'onesignal-subscriptions', payload: { subscriptionId: await subscribeWithOneSignal() } }
      : { path: 'push-subscriptions', payload: { subscription: await subscribeWithWebPush() } };

    const response = await fetch(`${backendUrl}/api/${provider.path}`, {
      method: 'POST',
      headers: await backendHeaders(sessionId),
      body: JSON.stringify({ sessionId, ...provider.payload }),
    });

    if (!response.ok) {
      throw new Error(`Subscription failed (${response.status}).`);
    }

    localStorage.setItem(`moon-face-cart-reminders:${sessionId}`, 'true');
    invalidateReadCache(`cart-reminder-status:${sessionId}`);
  } catch (err: unknown) {
    if (isBackendUnavailableError(err)) return;
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error in subscribeToCartReminders:', errorMessage);
    throw new Error('Unable to setup cart reminders.');
  }
}export async function loadCartReminderStatus(sessionId: string) {
  return cachedRead(`cart-reminder-status:${sessionId}`, async () => {
    try {
      const response = await fetch(`${backendUrl}/api/cart-reminders/status`, {
        headers: await backendHeaders(sessionId),
      });
      if (!response.ok) {
        if (response.status >= 500 || response.status === 404) return false;
        throw new Error('تعذر التحقق من حالة تذكير السلة.');
      }
      const result = await response.json() as { enabled?: boolean };
      return result.enabled === true;
    } catch (error) {
      if (isBackendUnavailableError(error)) return false;
      throw error;
    }
  });
}

export async function sendAdminBroadcastNotification(title: string, message: string) {
  if (!supabase) throw new Error('Supabase authentication is not configured.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('سجّلي الدخول بحساب مديرة المتجر أولاً.');
  const response = await fetch(`${backendUrl}/api/admin/notifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ title, message }),
  });
  const result = await response.json().catch(() => ({})) as { error?: string; sent?: number; oneSignalSent?: number; webPushSent?: number; webPushFailed?: number };
  if (!response.ok) throw new Error(result.error || 'تعذر إرسال الإشعار.');
  return result;
}

function decodeVapidKey(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function subscribeWithWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('Push notifications are not supported by this browser.');
  }
  if (Notification.permission === 'denied') {
    throw new Error('إشعارات الموقع محظورة في المتصفح. اسمح بها من إعدادات الموقع ثم أعد المحاولة.');
  }
  if (await Notification.requestPermission() !== 'granted') {
    throw new Error('لم يتم السماح بإشعارات الموقع.');
  }

  const keyResponse = await fetch(`${backendUrl}/api/push/public-key`);
  if (!keyResponse.ok) throw new Error('تعذر تحميل مفتاح الإشعارات.');
  const { publicKey } = await keyResponse.json() as { publicKey?: string };
  if (!publicKey) throw new Error('مفتاح الإشعارات غير متوفر.');

  await navigator.serviceWorker.register('/sw.js');
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription()
    || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(publicKey) });
  return subscription.toJSON();
}

export async function loadUserOrders(): Promise<StoreOrder[]> {
  if (supabase) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const userId = sessionData.session?.user.id;
    if (!userId) return [];
    return cachedRead(`orders:user:${userId}`, async () => {
      const { data, error } = await supabase.from('orders').select('id,customer_name,customer_email,customer_phone,customer_address,region,payload,status,created_at').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return (data || []).map(orderFromRow);
    });
  }
  return readLocal<StoreOrder[]>('moon-face-orders', []);
}

export async function lookupOrder(orderNumber: number, trackingToken: string): Promise<TrackedOrder | null> {
  if (supabase) {
    const { data, error } = await supabase.rpc('lookup_store_order', { p_order_number: orderNumber, p_tracking_token: trackingToken.trim() });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    const payload = row.payload || {};
    return {
      id: Number(row.order_number),
      customer: { name: String(payload.customer?.name || ''), phone: String(payload.customer?.phone || ''), address: String(payload.customer?.address || '') },
      region: String(payload.region || ''),
      items: Array.isArray(payload.items) ? payload.items : [],
      subtotal: Number(payload.subtotal || 0),
      discount: Number(payload.discount || 0),
      promoCode: String(payload.promoCode || ''),
      deliveryFee: Number(payload.deliveryFee || 0),
      status: row.status,
      createdAt: row.created_at,
      total: Number(row.total || 0),
    };
  }
  const orders = readLocal<(StoreOrder & { trackingToken?: string })[]>('moon-face-orders', []);
  const order = orders.find((item) => item.id === orderNumber && item.trackingToken === trackingToken.trim());
  if (!order) return null;
  return {
    id: order.id,
    customer: { name: order.customer.name, phone: order.customer.phone, address: order.customer.address },
    region: order.region,
    items: order.items,
    subtotal: order.subtotal,
    discount: order.discount,
    promoCode: order.promoCode,
    deliveryFee: order.deliveryFee,
    status: order.status,
    createdAt: order.createdAt,
    total: order.total,
  };
}

export async function loadOrders() {
  if (supabase) {
    return cachedRead('orders:owner', async () => {
      const { data, error } = await supabase.from('orders').select('id,customer_name,customer_email,customer_phone,customer_address,region,payload,status,created_at').order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return (data || []).map(orderFromRow);
    });
  }
  return readLocal<StoreOrder[]>('moon-face-orders', []);
}

export async function updateOrderStatus(id: number, status: string) {
  if (supabase) {
    const { error } = await supabase.from('orders').update({ status }).eq('id', id);
    if (error) throw error;
    invalidateOrderCaches();
    return;
  }
  const orders = readLocal<StoreOrder[]>('moon-face-orders', []);
  writeLocal('moon-face-orders', orders.map((order) => order.id === id ? { ...order, status } : order));
}

export async function deleteOrder(id: number) {
  if (supabase) {
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) throw error;
    invalidateOrderCaches();
    return;
  }
  const orders = readLocal<StoreOrder[]>('moon-face-orders', []);
  writeLocal('moon-face-orders', orders.filter((order) => order.id !== id));
}

export async function deleteAllOrders() {
  if (supabase) {
    const { error } = await supabase.from('orders').delete().not('id', 'is', null);
    if (error) throw error;
    invalidateOrderCaches();
    return;
  }
  writeLocal('moon-face-orders', []);
}

type ProductMetrics = { likes: number; saves: number; comments: number; rating: number; ratingCount: number };
type ProductMetricWaiter = { productIds: number[]; resolve: (metrics: Map<number, ProductMetrics>) => void; reject: (error: unknown) => void };
type ProductMetricRow = { product_id: number | string; like_count: number | string; save_count: number | string; comment_count: number | string; average_rating: number | string; rating_count: number | string };

const productMetricCache = new Map<number, { metrics: ProductMetrics; expiresAt: number }>();
const queuedProductMetricIds = new Set<number>();
const productMetricWaiters: ProductMetricWaiter[] = [];
const PRODUCT_METRIC_CACHE_MS = READ_CACHE_TTL_MS;
const MAX_PRODUCT_METRIC_CACHE_ENTRIES = 500;
const productInteractionBatches = new Map<string, ProductInteractionBatch>();
let productMetricBatchScheduled = false;

function emptyProductMetrics(): ProductMetrics {
  return { likes: 0, saves: 0, comments: 0, rating: 0, ratingCount: 0 };
}

async function fetchProductMetrics(productIds: number[]) {
  if (!supabase) return new Map<number, ProductMetrics>();
  const { data, error } = await supabase.rpc('get_product_metrics', { p_product_ids: productIds });
  if (error) throw error;

  const metricRows = (data || []) as ProductMetricRow[];
  const metrics = new Map(productIds.map((productId) => [productId, emptyProductMetrics()]));
  metricRows.forEach((item) => {
    const productId = Number(item.product_id);
    metrics.set(productId, {
      likes: Number(item.like_count),
      saves: Number(item.save_count),
      comments: Number(item.comment_count),
      rating: Number(item.average_rating) || 0,
      ratingCount: Number(item.rating_count) || 0,
    });
  });
  return metrics;
}

async function flushProductMetricBatch() {
  productMetricBatchScheduled = false;
  const productIds = [...queuedProductMetricIds];
  queuedProductMetricIds.clear();
  const waiters = productMetricWaiters.splice(0);
  if (!productIds.length) return;

  try {
    const metrics = await fetchProductMetrics(productIds);
    const now = Date.now();
    for (const [productId, entry] of productMetricCache) {
      if (entry.expiresAt <= now) productMetricCache.delete(productId);
    }
    productIds.forEach((productId) => {
      if (!productMetricCache.has(productId) && productMetricCache.size >= MAX_PRODUCT_METRIC_CACHE_ENTRIES) {
        const oldestProductId = productMetricCache.keys().next().value;
        if (oldestProductId !== undefined) productMetricCache.delete(oldestProductId);
      }
      productMetricCache.set(productId, {
        metrics: metrics.get(productId) || emptyProductMetrics(),
        expiresAt: now + PRODUCT_METRIC_CACHE_MS,
      });
    });
    waiters.forEach((waiter) => waiter.resolve(new Map(waiter.productIds.map((productId) => [
      productId,
      productMetricCache.get(productId)?.metrics || emptyProductMetrics(),
    ]))));
  } catch (error) {
    waiters.forEach((waiter) => waiter.reject(error));
  }
}

export function invalidateProductMetrics(productId?: number) {
  if (productId === undefined) productMetricCache.clear();
  else productMetricCache.delete(productId);
}

export async function loadProductMetrics(productIds: number[]): Promise<Map<number, ProductMetrics>> {
  const uniqueProductIds = [...new Set(productIds)];
  if (!uniqueProductIds.length) return new Map();
  if (!supabase) {
    const reviews = readLocal<ProductComment[]>('moon-face-product-reviews', []);
    return new Map(uniqueProductIds.map((productId) => {
      const productFeedback = reviews.filter((review) => review.product_id === productId);
      const ratings = productFeedback.map((review) => Number(review.rating)).filter((rating) => rating >= 1 && rating <= 5);
      return [productId, { likes: 0, saves: 0, comments: productFeedback.length, rating: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0, ratingCount: ratings.length }];
    }));
  }

  const now = Date.now();
  const missingProductIds = uniqueProductIds.filter((productId) => (productMetricCache.get(productId)?.expiresAt || 0) <= now);
  if (!missingProductIds.length) {
    return new Map(uniqueProductIds.map((productId) => [productId, productMetricCache.get(productId)!.metrics]));
  }

  return new Promise((resolve, reject) => {
    productMetricWaiters.push({ productIds: uniqueProductIds, resolve, reject });
    missingProductIds.forEach((productId) => queuedProductMetricIds.add(productId));
    if (productMetricBatchScheduled) return;
    productMetricBatchScheduled = true;
    queueMicrotask(() => void flushProductMetricBatch());
  });
}

const interactionMutationsInFlight = new Map<string, Promise<boolean>>();

function emptyProductInteractions(): ProductInteractions {
  return { likes: new Set<number>(), saves: new Set<number>(), comments: [] };
}

async function fetchProductInteractions(userId: string, productIds?: number[]): Promise<ProductInteractions> {
  if (!supabase) return emptyProductInteractions();
  let likesQuery = supabase.from('product_likes').select('product_id').eq('user_id', userId);
  let savesQuery = supabase.from('product_saves').select('product_id').eq('user_id', userId);
  let commentsQuery = supabase.from('product_comments').select('product_id,body,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
  likesQuery = likesQuery.limit(500);
  savesQuery = savesQuery.limit(500);
  if (productIds) {
    likesQuery = likesQuery.in('product_id', productIds);
    savesQuery = savesQuery.in('product_id', productIds);
    commentsQuery = commentsQuery.in('product_id', productIds);
  }
  const [{ data: likes, error: likesError }, { data: saves, error: savesError }, { data: comments, error: commentsError }] = await Promise.all([
    likesQuery,
    savesQuery,
    commentsQuery,
  ]);
  if (likesError) throw likesError;
  if (savesError) throw savesError;
  if (commentsError) throw commentsError;
  return {
    likes: new Set((likes || []).map((item) => Number(item.product_id))),
    saves: new Set((saves || []).map((item) => Number(item.product_id))),
    comments: (comments || []).map((comment) => ({ ...comment, product_id: Number(comment.product_id) })),
  };
}

function queueProductInteractionBatch(userId: string, productIds: number[]): Promise<ProductInteractions> {
  return new Promise((resolve, reject) => {
    const batch = productInteractionBatches.get(userId) || { productIds: new Set<number>(), waiters: [], scheduled: false };
    productIds.forEach((productId) => batch.productIds.add(productId));
    batch.waiters.push({ productIds, resolve, reject });
    productInteractionBatches.set(userId, batch);
    if (batch.scheduled) return;
    batch.scheduled = true;

    queueMicrotask(async () => {
      batch.scheduled = false;
      const batchedProductIds = [...batch.productIds];
      const waiters = batch.waiters.splice(0);
      batch.productIds.clear();
      try {
        const interactions = await fetchProductInteractions(userId, batchedProductIds);
        waiters.forEach((waiter) => {
          const requestedIds = new Set(waiter.productIds);
          waiter.resolve({
            likes: new Set([...interactions.likes].filter((productId) => requestedIds.has(productId))),
            saves: new Set([...interactions.saves].filter((productId) => requestedIds.has(productId))),
            comments: interactions.comments.filter((comment) => requestedIds.has(comment.product_id)),
          });
        });
      } catch (error) {
        waiters.forEach((waiter) => waiter.reject(error));
      } finally {
        if (!batch.scheduled && !batch.waiters.length) productInteractionBatches.delete(userId);
      }
    });
  });
}

export async function loadMyProductInteractions(productIds?: number[], expectedUserId?: string): Promise<ProductInteractions> {
  if (!supabase) return emptyProductInteractions();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = session?.user.id;
  if (!userId || (expectedUserId && expectedUserId !== userId)) return emptyProductInteractions();

  const scopedProductIds = productIds?.length ? [...new Set(productIds)].sort((first, second) => first - second) : undefined;
  const cacheKey = `interactions:${userId}:${scopedProductIds?.join(',') || 'all'}`;
  const result = await cachedRead(cacheKey, () => scopedProductIds
    ? queueProductInteractionBatch(userId, scopedProductIds)
    : fetchProductInteractions(userId));
  return { likes: new Set(result.likes), saves: new Set(result.saves), comments: [...result.comments] };
}

export async function toggleProductInteraction(productId: number, kind: 'like' | 'save', expectedUserId?: string) {
  if (!supabase) throw new Error('Sign in to save product interactions.');
  const mutationKey = `${expectedUserId || 'current'}:${productId}:${kind}`;
  const pending = interactionMutationsInFlight.get(mutationKey);
  if (pending) return pending;

  const mutation = (async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const user = session?.user;
    if (!user || (expectedUserId && expectedUserId !== user.id)) throw new Error('Sign in to save product interactions.');
    const table = kind === 'like' ? 'product_likes' : 'product_saves';
    const { data: existing, error: readError } = await supabase.from(table).select('product_id').eq('user_id', user.id).eq('product_id', productId).maybeSingle();
    if (readError) throw readError;
    if (existing) {
      const { error } = await supabase.from(table).delete().eq('user_id', user.id).eq('product_id', productId);
      if (error) throw error;
      invalidateReadCachePrefix(`interactions:${user.id}:`);
      invalidateProductMetrics(productId);
      invalidateReadCache('owner-activity');
      return false;
    }
    const { error } = await supabase.from(table).insert({ user_id: user.id, product_id: productId });
    if (error) throw error;
    invalidateReadCachePrefix(`interactions:${user.id}:`);
    invalidateProductMetrics(productId);
    invalidateReadCache('owner-activity');
    return true;
  })();
  interactionMutationsInFlight.set(mutationKey, mutation);
  try {
    return await mutation;
  } finally {
    if (interactionMutationsInFlight.get(mutationKey) === mutation) interactionMutationsInFlight.delete(mutationKey);
  }
}

export function invalidateProductComments(productId?: number, cacheScope?: string) {
  const prefix = productId === undefined ? 'product-comments:' : `product-comments:${productId}:`;
  if (cacheScope) invalidateReadCache(`${prefix}${cacheScope}`);
  else invalidateReadCachePrefix(prefix);
}

function invalidateProductFeedback(productId?: number) {
  invalidateProductComments(productId);
  invalidateProductMetrics(productId);
}

export async function loadProductComments(productId: number, cacheScope = 'anonymous'): Promise<ProductComment[]> {
  return cachedRead(`product-comments:${productId}:${cacheScope}`, async () => {
    if (!supabase) return readLocal<ProductComment[]>('moon-face-product-reviews', []).filter((review) => review.product_id === productId).slice(0, 30);
    const { data, error } = await supabase.from('product_comments').select('id,product_id,user_id,display_name,body,rating,created_at').eq('product_id', productId).order('created_at', { ascending: false }).limit(30);
    if (error) throw error;
    return (data || []) as ProductComment[];
  });
}

export async function addProductReview(productId: number, displayName: string, rating: number, body: string) {
  const review = {
    id: crypto.randomUUID(),
    product_id: productId,
    display_name: displayName.trim() || 'زائر',
    body: body.trim(),
    rating,
    created_at: new Date().toISOString(),
  };
  if (rating < 1 || rating > 5 || !review.body) throw new Error('أضف تقييماً من نجمة إلى خمس واكتب رأيك.');
  if (!supabase) {
    writeLocal('moon-face-product-reviews', [...readLocal<ProductComment[]>('moon-face-product-reviews', []), review]);
    invalidateProductFeedback(productId);
    return;
  }
  const { data } = await supabase.auth.getSession();
  const { error } = await supabase.from('product_comments').insert({ ...review, user_id: data.session?.user.id || null });
  if (error) throw error;
  invalidateReadCache('owner-activity');
  invalidateProductFeedback(productId);
}

export async function addProductComment(productId: number, displayName: string, body: string) {
  const commentBody = body.trim();
  if (!commentBody) throw new Error('Write a comment before submitting.');
  const comment: ProductComment = { id: crypto.randomUUID(), product_id: productId, display_name: displayName.trim() || 'Guest', body: commentBody, rating: null, created_at: new Date().toISOString() };
  if (!supabase) {
    writeLocal('moon-face-product-reviews', [...readLocal<ProductComment[]>('moon-face-product-reviews', []), comment]);
    invalidateProductFeedback(productId);
    return;
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session?.user) throw new Error('Sign in to comment.');
  const { error } = await supabase.from('product_comments').insert({ user_id: sessionData.session.user.id, product_id: productId, display_name: displayName, body: commentBody });
  if (error) throw error;
  invalidateReadCache('owner-activity');
  invalidateProductFeedback(productId);
}

export async function saveStoreFeedback(feedback: { kind: 'opinion' | 'note' | 'idea'; name: string; replyEmail: string; message: string }) {
  if (!supabase) return false;
  const { error } = await supabase.from('store_feedback').insert({
    kind: feedback.kind,
    name: feedback.name.trim().slice(0, 120),
    reply_email: feedback.replyEmail.trim().slice(0, 254),
    message: feedback.message.trim().slice(0, 5000),
  });
  if (error) throw error;
  return true;
}

export async function loadOwnerActivity() {
  if (!supabase) return { likes: [], saves: [], comments: [] };
  return cachedRead('owner-activity', async () => {
    const [likes, saves, comments] = await Promise.all([
      supabase.from('product_likes').select('user_id,product_id,created_at').order('created_at', { ascending: false }).limit(500),
      supabase.from('product_saves').select('user_id,product_id,created_at').order('created_at', { ascending: false }).limit(500),
      supabase.from('product_comments').select('id,user_id,product_id,display_name,body,rating,is_approved,created_at').order('created_at', { ascending: false }).limit(500),
    ]);
    if (likes.error) throw likes.error;
    if (saves.error) throw saves.error;
    if (comments.error) throw comments.error;
    const userIds = [...new Set([...(likes.data || []), ...(saves.data || []), ...(comments.data || [])].map((item: any) => item.user_id).filter(Boolean))];
    const { data: profiles, error: profilesError } = userIds.length
      ? await supabase.from('profiles').select('id,email,display_name').in('id', userIds).limit(userIds.length)
      : { data: [], error: null };
    if (profilesError) throw profilesError;
    const profileMap = new Map((profiles || []).map((item) => [item.id, item]));
    const withProfile = (items: any[]) => items.map((item) => ({ ...item, profile: profileMap.get(item.user_id) || null }));
    return { likes: withProfile(likes.data || []), saves: withProfile(saves.data || []), comments: withProfile(comments.data || []) };
  });
}

export async function moderateProductComment(id: string, approved: boolean) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.from('product_comments').update({ is_approved: approved }).eq('id', id);
  if (error) throw error;
  invalidateReadCache('owner-activity');
  invalidateProductFeedback();
}

export async function deleteProductComment(id: string) {
  if (!supabase) {
    writeLocal('moon-face-product-reviews', readLocal<ProductComment[]>('moon-face-product-reviews', []).filter((comment) => comment.id !== id));
    invalidateProductFeedback();
    return;
  }
  const { error } = await supabase.from('product_comments').delete().eq('id', id);
  if (error) throw error;
  invalidateReadCache('owner-activity');
  invalidateProductFeedback();
}

export async function saveUploadedMedia(blob: Blob, filename: string, tryLosslessCompression = false) {
  if (blob.size > 100 * 1024 * 1024) throw new Error('حجم الملف يتجاوز 100MB. اختر ملفاً أصغر.');
  if (supabase) {
    const extension = blob.type === 'image/webp' ? 'webp' : filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const path = `${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from('store-media').upload(path, blob, { contentType: blob.type || 'application/octet-stream', upsert: false, cacheControl: '3600' });
    if (error) throw error;
    return supabase.storage.from('store-media').getPublicUrl(path).data.publicUrl;
  }
  return saveLocalMedia(blob, tryLosslessCompression);
}

export async function deleteStoredMedia(source: string) {
  if (source.startsWith('local-media:')) return deleteLocalMedia(source);
  if (!supabase || !source.includes('/storage/v1/object/public/store-media/')) return;
  const path = source.split('/storage/v1/object/public/store-media/')[1]?.split('?')[0];
  if (!path) return;
  const { error } = await supabase.storage.from('store-media').remove([decodeURIComponent(path)]);
  if (error) throw error;
}
