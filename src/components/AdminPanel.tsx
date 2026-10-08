import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Archive, Check, ChevronDown, ChevronUp, Download, Eye, GripVertical, ImagePlus, LoaderCircle, Megaphone, Plus, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';
import type { Product } from '../data/products';
import type { SiteContent } from '../data/siteContent';
import { getProductColorHex } from '../utils/productColors';
import { optimizeImage } from '../utils/optimizeImage';
import { useAuth } from '../context/AuthContext';
import { loadArchivedProducts as loadArchivedProductsFromApi, loadLoyaltyConfig, loadWheelConfig, permanentlyDeleteArchivedProduct, saveLoyaltyConfig, saveWheelConfig, saveUploadedMedia, sendAdminBroadcastNotification, type LoyaltyCampaign, type LoyaltyConfig, type WheelConfig, type WheelSlice } from '../lib/api';
import StoredMedia from './StoredMedia';
import OrderPreviewDialog from './OrderPreviewDialog';
import { deleteAllOrders as deleteAllOrdersFromApi, deleteOrder as deleteOrderFromApi, deleteProductComment, loadOrders as loadOrdersFromApi, loadOwnerActivity, moderateProductComment, updateOrderStatus as updateOrderStatusInApi } from '../lib/api';
type OrderItem = { id: number; name: string; color: string; size?: string; price: number; quantity: number };
type OrderStatus = 'new' | 'cancelled' | 'postponed' | 'delivered' | 'exchanged';
type Order = {
  id: number;
  customer: { name: string; phone: string; address: string };
  region: string;
  items: OrderItem[];
  subtotal?: number;
  discount?: number;
  promoCode?: string;
  deliveryFee?: number;
  total: number;
  status?: OrderStatus;
  createdAt: string;
};

type Tab = 'products' | 'orders' | 'activity' | 'settings' | 'loyalty' | 'wheel' | 'archive' | 'notifications';
type OwnerActivity = Awaited<ReturnType<typeof loadOwnerActivity>>;
const productBadgeOptions = ['', 'جديد', 'الأكثر مبيعًا', 'مميز', 'حصري', 'عرض خاص', 'الأكثر طلبًا'];
export default function AdminPanel({ products, onSave, siteContent, onSaveSiteContent, open, onOpenChange, embedded = false }: { products: Product[]; onSave: (products: Product[]) => Promise<void>; siteContent: SiteContent; onSaveSiteContent: (content: SiteContent) => Promise<void>; open?: boolean; onOpenChange?: (open: boolean) => void; embedded?: boolean; }) {
  const { profile } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  };
  const [tab, setTab] = useState<Tab>('products');
  const [draft, setDraft] = useState<Product[]>(products);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [activity, setActivity] = useState<OwnerActivity>({ likes: [], saves: [], comments: [] });
  const [activityLoading, setActivityLoading] = useState(false);
  const [contentDraft, setContentDraft] = useState<SiteContent>(siteContent);
  const [loyaltyConfig, setLoyaltyConfig] = useState<LoyaltyConfig>({ pointsPerCurrency: 1, currencyValuePerPoint: 0.01, campaigns: [] });
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [loyaltySaving, setLoyaltySaving] = useState(false);
  const [wheelConfig, setWheelConfig] = useState<WheelConfig>({ enabled: false, slices: [] });
  const [wheelLoading, setWheelLoading] = useState(false);
  const [wheelSaving, setWheelSaving] = useState(false);
  const [archivedProducts, setArchivedProducts] = useState<Product[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [productsSaving, setProductsSaving] = useState(false);
  const [contentSaving, setContentSaving] = useState(false);
  const [contentSaved, setContentSaved] = useState(false);
  const savingProductsRef = useRef(false);

  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      setOrders(await loadOrdersFromApi() as Order[]);
    } catch {
      setSaveError('تعذر تحميل الطلبات. تحقق من اتصال خدمة الإدارة.');
    } finally {
      setOrdersLoading(false);
    }
  };

  const refreshActivity = async () => {
    setActivityLoading(true);
    try { setActivity(await loadOwnerActivity()); }
    catch { setSaveError('تعذر تحميل تفاعلات العملاء.'); }
    finally { setActivityLoading(false); }
  };

  const loadLoyalty = async () => {
    setLoyaltyLoading(true);
    setSaveError('');
    try { setLoyaltyConfig(await loadLoyaltyConfig()); }
    catch { setSaveError('تعذر تحميل إعدادات نقاط الولاء.'); }
    finally { setLoyaltyLoading(false); }
  };

  const saveLoyalty = async () => {
    setLoyaltySaving(true);
    setSaveError('');
    try { await saveLoyaltyConfig(loyaltyConfig); }
    catch { setSaveError('تعذر حفظ إعدادات نقاط الولاء.'); }
    finally { setLoyaltySaving(false); }
  };

  const loadWheel = async () => {
    setWheelLoading(true);
    setSaveError('');
    try { setWheelConfig(await loadWheelConfig()); }
    catch { setSaveError('تعذر تحميل إعدادات عجلة الحظ.'); }
    finally { setWheelLoading(false); }
  };

  const saveWheel = async () => {
    setWheelSaving(true);
    setSaveError('');
    try { await saveWheelConfig(wheelConfig); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'تعذر حفظ إعدادات العجلة.'); }
    finally { setWheelSaving(false); }
  };

  const loadProductArchive = async () => {
    setArchiveLoading(true);
    setSaveError('');
    try { setArchivedProducts(await loadArchivedProductsFromApi()); }
    catch { setSaveError('تعذر تحميل أرشيف المنتجات.'); }
    finally { setArchiveLoading(false); }
  };

  const restoreArchivedProduct = async (product: Product) => {
    const nextProducts = [...products.filter((item) => item.id !== product.id), { ...product, isArchived: false }];
    try {
      await save(nextProducts);
      setDraft(nextProducts);
      setArchivedProducts((current) => current.filter((item) => item.id !== product.id));
    } catch {
      setSaveError('تعذرت استعادة المنتج. لم يتم تأكيد التغيير.');
    }
  };

  const permanentlyDeleteArchived = async (product: Product) => {
    if (!window.confirm(`سيتم حذف ${product.nameAr || product.name} نهائياً. لا يمكن التراجع عن هذه الخطوة. هل تريد المتابعة؟`)) return;
    setSaveError('');
    try {
      await permanentlyDeleteArchivedProduct(product.id);
      setArchivedProducts((current) => current.filter((item) => item.id !== product.id));
    } catch {
      setSaveError('تعذر حذف المنتج نهائياً.');
    }
  };

  // تعريف دالة قراءة الصور بشكل مستقل وصحيح
  const readImages = (files: FileList | null, onRead: (images: string[]) => void) => {
    if (!files?.length) return;
    void uploadOptimizedImages(Array.from(files)).then(onRead).catch(() => setSaveError('تعذر حفظ الصور في التخزين.'));
  };

  const readMediaFiles = (files: FileList | null, onRead: (media: NonNullable<Product['media']>) => void) => {
    const images = Array.from(files || []).filter((file) => file.type.startsWith('image/'));
    if (!images.length) return;
    void uploadOptimizedImages(images).then((urls) => onRead(urls.map((url) => ({ type: 'image' as const, url })))).catch(() => setSaveError('تعذر حفظ الصور في التخزين المحلي.'));
  };

const save = async (productsToSave?: Product[]) => {
  if (savingProductsRef.current) return;
  savingProductsRef.current = true;
  setProductsSaving(true);
    setSaveError('');
    try {
      await onSave(productsToSave || draft);
    } catch (error) {
      console.error('تعذر حفظ المنتجات محليًا', error);
      setSaveError('تعذر الحفظ في هذا المتصفح. حاول مرة أخرى.');
      throw error;
    } finally {
      savingProductsRef.current = false;
      setProductsSaving(false);
    }
    if (!productsToSave) setOpen(false);
  };
  const saveContent = async () => {
    if (contentSaving) return;
    setContentSaving(true);
    setContentSaved(false);
    setSaveError('');
    try {
      await onSaveSiteContent(contentDraft);
      setContentSaved(true);
    } catch (error) {
      console.error('تعذر حفظ محتوى الموقع محليًا', error);
      setSaveError('تعذر الحفظ في هذا المتصفح. حاول مرة أخرى.');
      return;
    } finally {
      setContentSaving(false);
    }
    setOpen(false);
  };  return (
    <>
      {profile?.is_store_owner && (
        embedded ? (
          <div className="space-y-5 rounded-2xl border border-[#d3d4bf] bg-white p-4 shadow-sm">
            <h2 className="text-2xl font-bold">لوحة الإدارة</h2>
            {saveError && <p className="text-sm text-red-600 mb-4">{saveError}</p>}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
              <button onClick={() => setTab('products')} className={`py-3 rounded-xl font-semibold transition-all ${tab === 'products' ? 'bg-[#3B2A22] text-white' : 'bg-white'}`}>المنتجات</button>
              <button onClick={() => { setTab('orders'); void loadOrders(); }} className={`py-3 rounded-xl font-semibold transition-all ${tab === 'orders' ? 'bg-[#3B2A22] text-white' : 'bg-white'}`}>الطلبات</button>
              <button onClick={() => { setTab('activity'); void refreshActivity(); }} className={`py-3 rounded-xl font-semibold transition-all ${tab === 'activity' ? 'bg-[#3B2A22] text-white' : 'bg-white'}`}>التفاعلات</button>
              <button onClick={() => setTab('settings')} className={`py-3 rounded-xl font-semibold transition-all ${tab === 'settings' ? 'bg-[#3B2A22] text-white' : 'bg-white'}`}>المحتوى</button>
              <button onClick={() => { setTab('loyalty'); void loadLoyalty(); }} className={`py-3 rounded-xl font-semibold transition-all ${tab === 'loyalty' ? 'bg-[#3B2A22] text-white' : 'bg-white'}`}>الولاء</button>
              <button onClick={() => { setTab('wheel'); void loadWheel(); }} className={`py-3 rounded-xl font-semibold transition-all ${tab === 'wheel' ? 'bg-[#3B2A22] text-white' : 'bg-white'}`}>العجلة</button>
              <button onClick={() => { setTab('archive'); void loadProductArchive(); }} className={`py-3 rounded-xl font-semibold transition-all ${tab === 'archive' ? 'bg-[#3B2A22] text-white' : 'bg-white'}`}>الأرشيف</button>
              <button onClick={() => setTab('notifications')} className={`py-3 rounded-xl font-semibold transition-all ${tab === 'notifications' ? 'bg-[#3B2A22] text-white' : 'bg-white'}`}>الإشعارات</button>
            </div>
            {tab === 'products' ? <ProductsTab draft={draft} productTypes={siteContent.productTypes} update={update} onDraftChange={setDraft} onSave={save} saving={productsSaving} readImages={readImages} onError={setSaveError} /> : tab === 'orders' ? <OrdersTab orders={orders} products={products} loading={ordersLoading} onOrdersChange={setOrders} onError={setSaveError} /> : tab === 'activity' ? <ActivityTab activity={activity} loading={activityLoading} onRefresh={refreshActivity} onError={setSaveError} /> : tab === 'loyalty' ? <LoyaltyTab config={loyaltyConfig} loading={loyaltyLoading} saving={loyaltySaving} productTypes={siteContent.productTypes} update={setLoyaltyConfig} onSave={saveLoyalty} /> : tab === 'wheel' ? <WheelTab config={wheelConfig} loading={wheelLoading} saving={wheelSaving} update={setWheelConfig} onSave={saveWheel} /> : tab === 'archive' ? <ArchivedProductsTab products={archivedProducts} loading={archiveLoading} onRestore={restoreArchivedProduct} onDeletePermanently={permanentlyDeleteArchived} /> : tab === 'notifications' ? <BroadcastNotificationsTab /> : <ContentTab draft={contentDraft} products={products} update={setContentDraft} onSave={saveContent} readMediaFiles={readMediaFiles} onError={setSaveError} saving={contentSaving} saved={contentSaved} />}
          </div>
        ) : (
          <AnimatePresence>
            {isOpen && (
              <>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} className="fixed inset-0 bg-black/40 z-[70]" />
                <motion.aside initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} dir="rtl" className="fixed top-0 left-0 z-[71] h-full w-full max-w-lg bg-[#faf8f5] shadow-2xl p-6 overflow-y-auto">
                  <button onClick={() => setOpen(false)} className="absolute top-5 left-5" aria-label="إغلاق"><X /></button>
                  <>
                    <h2 className="text-2xl font-bold mb-2">لوحة الإدارة</h2>
                    {saveError && <p className="text-sm text-red-600 mb-4">{saveError}</p>}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
                      <button onClick={() => setTab('products')} className={`py-3 rounded-xl font-semibold transition-all ${tab === 'products' ? 'bg-[#3B2A22] text-white' : 'bg-white'}`}>المنتجات</button>
                      <button onClick={() => { setTab('orders'); void loadOrders(); }} className={`py-3 rounded-xl font-semibold transition-all ${tab === 'orders' ? 'bg-[#3B2A22] text-white' : 'bg-white'}`}>الطلبات</button>
                      <button onClick={() => { setTab('activity'); void refreshActivity(); }} className={`py-3 rounded-xl font-semibold transition-all ${tab === 'activity' ? 'bg-[#3B2A22] text-white' : 'bg-white'}`}>التفاعلات</button>
                      <button onClick={() => setTab('settings')} className={`py-3 rounded-xl font-semibold transition-all ${tab === 'settings' ? 'bg-[#3B2A22] text-white' : 'bg-white'}`}>المحتوى</button>
                      <button onClick={() => { setTab('loyalty'); void loadLoyalty(); }} className={`py-3 rounded-xl font-semibold transition-all ${tab === 'loyalty' ? 'bg-[#3B2A22] text-white' : 'bg-white'}`}>الولاء</button>
                      <button onClick={() => { setTab('wheel'); void loadWheel(); }} className={`py-3 rounded-xl font-semibold transition-all ${tab === 'wheel' ? 'bg-[#3B2A22] text-white' : 'bg-white'}`}>العجلة</button>
                      <button onClick={() => { setTab('archive'); void loadProductArchive(); }} className={`py-3 rounded-xl font-semibold transition-all ${tab === 'archive' ? 'bg-[#3B2A22] text-white' : 'bg-white'}`}>الأرشيف</button>
                      <button onClick={() => setTab('notifications')} className={`py-3 rounded-xl font-semibold transition-all ${tab === 'notifications' ? 'bg-[#3B2A22] text-white' : 'bg-white'}`}>الإشعارات</button>
                    </div>
                    {tab === 'products' ? <ProductsTab draft={draft} productTypes={siteContent.productTypes} update={update} onDraftChange={setDraft} onSave={save} saving={productsSaving} readImages={readImages} onError={setSaveError} /> : tab === 'orders' ? <OrdersTab orders={orders} products={products} loading={ordersLoading} onOrdersChange={setOrders} onError={setSaveError} /> : tab === 'activity' ? <ActivityTab activity={activity} loading={activityLoading} onRefresh={refreshActivity} onError={setSaveError} /> : tab === 'loyalty' ? <LoyaltyTab config={loyaltyConfig} loading={loyaltyLoading} saving={loyaltySaving} productTypes={siteContent.productTypes} update={setLoyaltyConfig} onSave={saveLoyalty} /> : tab === 'wheel' ? <WheelTab config={wheelConfig} loading={wheelLoading} saving={wheelSaving} update={setWheelConfig} onSave={saveWheel} /> : tab === 'archive' ? <ArchivedProductsTab products={archivedProducts} loading={archiveLoading} onRestore={restoreArchivedProduct} onDeletePermanently={permanentlyDeleteArchived} /> : tab === 'notifications' ? <BroadcastNotificationsTab /> : <ContentTab draft={contentDraft} products={products} update={setContentDraft} onSave={saveContent} readMediaFiles={readMediaFiles} onError={setSaveError} saving={contentSaving} saved={contentSaved} />}
                  </>
                </motion.aside>
              </>
            )}
          </AnimatePresence>
        )
      )}
    </>
  );

  function update(index: number, change: Partial<Product>) {
    setDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...change } : item));
  }
}

function ArchivedProductsTab({ products, loading, onRestore, onDeletePermanently }: { products: Product[]; loading: boolean; onRestore: (product: Product) => void; onDeletePermanently: (product: Product) => void }) {
  if (loading) return <p className="py-10 text-center text-charcoal-500">جارٍ تحميل الأرشيف...</p>;
  if (!products.length) return <div className="py-12 text-center text-charcoal-500"><Archive size={25} className="mx-auto mb-3 opacity-60" /><p>أرشيف المنتجات فارغ.</p></div>;
  return <section className="space-y-3">
    <h3 className="font-bold text-lg">أرشيف المنتجات ({products.length})</h3>
    {products.map((product) => <article key={product.id} className="flex items-center gap-3 rounded-xl border border-moon-face-200 bg-white p-3">
      <StoredMedia type="image" source={product.image} alt={product.nameAr || product.name} className="size-16 shrink-0 rounded-lg object-cover" />
      <div className="min-w-0 flex-1"><b className="block truncate">{product.nameAr || product.name}</b><p className="mt-1 text-xs text-charcoal-500">{product.category} · ₪{product.price}</p></div>
      <div className="flex shrink-0 gap-1">
        <button type="button" onClick={() => onRestore(product)} aria-label={`استعادة ${product.nameAr || product.name}`} title="استعادة المنتج" className="grid size-10 place-items-center rounded-lg border border-moon-face-200 text-[#68704B] hover:bg-moon-face-50"><RotateCcw size={17} /></button>
        <button type="button" onClick={() => onDeletePermanently(product)} aria-label={`حذف ${product.nameAr || product.name} نهائياً`} title="حذف نهائي" className="grid size-10 place-items-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50"><Trash2 size={17} /></button>
      </div>
    </article>)}
  </section>;
}

function BroadcastNotificationsTab() {
  const [title, setTitle] = useState('Moon Face');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const send = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending || !message.trim()) return;
    if (!window.confirm('سيتم إرسال هذا الإشعار لكل المشتركين بإشعارات المتجر. هل تريد المتابعة؟')) return;
    setSending(true);
    setNotice('');
    setError('');
    try {
      const result = await sendAdminBroadcastNotification(title.trim() || 'Moon Face', message.trim());
      setNotice(result.sent
        ? `تم إرسال الإشعار إلى ${result.sent} جهازاً مشتركاً.`
        : 'تم الإرسال، لكن لا توجد أجهزة مشتركة حالياً.');
      setMessage('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إرسال الإشعار.');
    } finally {
      setSending(false);
    }
  };

  return <section className="max-w-2xl space-y-4 rounded-xl bg-white p-4">
    <div className="flex items-center gap-2"><Megaphone size={19} className="text-[#68704B]" /><h3 className="text-lg font-bold">إشعار لجميع المشتركين</h3></div>
    <p className="text-sm text-charcoal-500">يصل الإشعار للأجهزة التي سمحت بإشعارات المتجر عبر OneSignal أو إشعارات المتصفح.</p>
    <form onSubmit={(event) => void send(event)} className="space-y-3">
      <label className="block text-sm font-semibold">عنوان الإشعار<input className="field mt-1" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} /></label>
      <label className="block text-sm font-semibold">نص الإشعار<textarea className="field mt-1 min-h-28 resize-y" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} required placeholder="اكتبي نص الإشعار..." /></label>
      <button type="submit" disabled={sending || !message.trim()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#563C2E] py-3 font-bold text-white disabled:cursor-wait disabled:opacity-50">
        {sending ? <><LoaderCircle size={17} className="animate-spin" /> جارٍ الإرسال...</> : <><Megaphone size={17} /> إرسال للجميع</>}
      </button>
    </form>
    {notice && <p role="status" className="text-sm font-semibold text-[#656B48]">{notice}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}

function LoyaltyTab({ config, loading, saving, productTypes, update, onSave }: { config: LoyaltyConfig; loading: boolean; saving: boolean; productTypes: string[]; update: (config: LoyaltyConfig) => void; onSave: () => void }) {
  const [campaignDraft, setCampaignDraft] = useState<LoyaltyCampaign>({ id: '', label: '', matchField: 'productType', matchValue: '', multiplier: 2 });
  const addCampaign = () => {
    if (!campaignDraft.label.trim() || !campaignDraft.matchValue.trim() || campaignDraft.multiplier < 1) return;
    update({ ...config, campaigns: [...config.campaigns, { ...campaignDraft, id: crypto.randomUUID(), label: campaignDraft.label.trim(), matchValue: campaignDraft.matchValue.trim() }] });
    setCampaignDraft({ id: '', label: '', matchField: 'productType', matchValue: '', multiplier: 2 });
  };
  const setCampaign = (index: number, change: Partial<LoyaltyCampaign>) => update({ ...config, campaigns: config.campaigns.map((campaign, campaignIndex) => campaignIndex === index ? { ...campaign, ...change } : campaign) });
  if (loading) return <p className="py-10 text-center text-charcoal-500">جارٍ تحميل إعدادات الولاء...</p>;
  return <div className="space-y-5">
    <section className="space-y-3 rounded-xl bg-white p-4">
      <h3 className="font-bold text-lg">معدل كسب واستبدال النقاط</h3>
      <label className="block text-sm">النقاط المكتسبة لكل ₪ من قيمة المنتجات<input className="field mt-1" type="number" min="0" step="0.1" value={config.pointsPerCurrency} onChange={(event) => update({ ...config, pointsPerCurrency: Number(event.target.value) })} /></label>
      <label className="block text-sm">قيمة النقطة الواحدة بالشيكل<input className="field mt-1" type="number" min="0.0001" step="0.01" value={config.currencyValuePerPoint} onChange={(event) => update({ ...config, currencyValuePerPoint: Number(event.target.value) })} /></label>
      <p className="text-xs text-charcoal-500">تُضاف النقاط عند تحويل حالة الطلب إلى «تم التسليم»، وتُعكس تلقائياً إذا تغيرت الحالة لاحقاً.</p>
    </section>
    <section className="space-y-3 rounded-xl bg-white p-4">
      <div><h3 className="font-bold text-lg">مضاعفات الحملات</h3><p className="text-xs text-charcoal-500">اربط العرض بنوع المنتج أو اسمه أو تصنيفه، وحدد تاريخ صلاحية اختياري.</p></div>
      <div className="grid grid-cols-2 gap-2">
        <input className="field" value={campaignDraft.label} onChange={(event) => setCampaignDraft({ ...campaignDraft, label: event.target.value })} placeholder="اسم العرض أو المجموعة" />
        <input className="field" type="number" min="1" step="0.1" value={campaignDraft.multiplier} onChange={(event) => setCampaignDraft({ ...campaignDraft, multiplier: Number(event.target.value) })} aria-label="مضاعف النقاط" />
        <select className="field" value={campaignDraft.matchField} onChange={(event) => setCampaignDraft({ ...campaignDraft, matchField: event.target.value as LoyaltyCampaign['matchField'] })} aria-label="مطابقة الحملة">
          <option value="productType">نوع المنتج</option><option value="category">التصنيف</option><option value="name">اسم المنتج</option>
        </select>
        {campaignDraft.matchField === 'productType' && productTypes.length ? <select className="field" value={campaignDraft.matchValue} onChange={(event) => setCampaignDraft({ ...campaignDraft, matchValue: event.target.value })} aria-label="قيمة المطابقة"><option value="">اختيار النوع</option>{productTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select> : <input className="field" value={campaignDraft.matchValue} onChange={(event) => setCampaignDraft({ ...campaignDraft, matchValue: event.target.value })} placeholder="قيمة المطابقة" />}
        <label className="text-xs text-charcoal-500">تبدأ في<input className="field mt-1" type="datetime-local" value={campaignDraft.startsAt?.slice(0, 16) || ''} onChange={(event) => setCampaignDraft({ ...campaignDraft, startsAt: event.target.value || undefined })} /></label>
        <label className="text-xs text-charcoal-500">تنتهي في<input className="field mt-1" type="datetime-local" value={campaignDraft.endsAt?.slice(0, 16) || ''} onChange={(event) => setCampaignDraft({ ...campaignDraft, endsAt: event.target.value || undefined })} /></label>
      </div>
      <button type="button" onClick={addCampaign} disabled={!campaignDraft.label.trim() || !campaignDraft.matchValue.trim()} className="w-full border border-[#563C2E] py-2 text-sm font-semibold text-[#563C2E] disabled:opacity-40">إضافة المضاعف</button>
      <div className="divide-y divide-moon-face-100">{config.campaigns.map((campaign, index) => <div key={campaign.id} className="space-y-2 py-3">
        <input className="field" value={campaign.label} onChange={(event) => setCampaign(index, { label: event.target.value })} aria-label="اسم العرض" />
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <select className="field min-w-0" value={campaign.matchField} onChange={(event) => setCampaign(index, { matchField: event.target.value as LoyaltyCampaign['matchField'] })} aria-label="مطابقة الحملة"><option value="productType">نوع المنتج</option><option value="category">التصنيف</option><option value="name">اسم المنتج</option></select>
          <input className="field min-w-0" value={campaign.matchValue} onChange={(event) => setCampaign(index, { matchValue: event.target.value })} aria-label="قيمة المطابقة" />
          <input className="field w-20" type="number" min="1" step="0.1" value={campaign.multiplier} onChange={(event) => setCampaign(index, { multiplier: Number(event.target.value) })} aria-label="مضاعف النقاط" />
        </div>
        <button type="button" onClick={() => update({ ...config, campaigns: config.campaigns.filter((_, campaignIndex) => campaignIndex !== index) })} className="flex items-center gap-1 text-xs text-red-700"><Trash2 size={14} /> حذف العرض</button>
      </div>)}</div>
    </section>
    <button type="button" onClick={onSave} disabled={saving} className="w-full rounded-lg bg-[#3B2A22] py-3 font-bold text-white disabled:opacity-50">{saving ? 'جارٍ الحفظ...' : 'حفظ إعدادات الولاء'}</button>
  </div>;
}

function WheelTab({ config, loading, saving, update, onSave }: { config: WheelConfig; loading: boolean; saving: boolean; update: (config: WheelConfig) => void; onSave: () => void }) {
  const colors = ['#a56c4f', '#5e6d49', '#c5a875', '#563C2E', '#b66b6b', '#6c8293', '#8c7155', '#7c8660'];
  const totalProbability = config.slices.reduce((sum, slice) => sum + Number(slice.probability || 0), 0);
  const updateSlice = (index: number, change: Partial<WheelSlice>) => update({ ...config, slices: config.slices.map((slice, sliceIndex) => sliceIndex === index ? { ...slice, ...change } : slice) });
  const addSlice = () => {
    if (config.slices.length >= 12) return;
    update({ ...config, slices: [...config.slices, { id: crypto.randomUUID(), label: '', probability: 0, rewardType: 'none', rewardValue: 0, color: colors[config.slices.length % colors.length] }] });
  };

  if (loading) return <p className="py-10 text-center text-charcoal-500">جارٍ تحميل إعدادات العجلة...</p>;
  return <div className="space-y-5">
    <label className="flex items-center justify-between gap-4 rounded-xl bg-white p-4">
      <span><b className="block">إظهار عجلة الحظ في المتجر</b><span className="text-xs text-charcoal-500">تظهر للزوار أيقونة عائمة وتُفتح نافذة مرة واحدة.</span></span>
      <input type="checkbox" checked={config.enabled} onChange={(event) => update({ ...config, enabled: event.target.checked })} className="size-5 accent-[#563C2E]" />
    </label>
    <section className="space-y-3 rounded-xl bg-white p-4">
      <div className="flex items-center justify-between gap-2"><div><h3 className="font-bold text-lg">شرائح الجوائز</h3><p className="text-xs text-charcoal-500">مجموع الاحتمالات يجب أن يساوي 100%، وكود الخصم يُنشأ لكل فائز.</p></div><span className={`shrink-0 text-sm font-bold tabular-nums ${Math.abs(totalProbability - 100) < 0.01 ? 'text-green-700' : 'text-red-700'}`}>{totalProbability}%</span></div>
      <div className="space-y-3">{config.slices.map((slice, index) => <div key={slice.id} className="space-y-2 border-t border-moon-face-100 pt-3">
        <div className="grid grid-cols-[1fr_5rem_auto] gap-2"><input className="field min-w-0" value={slice.label} onChange={(event) => updateSlice(index, { label: event.target.value })} placeholder="اسم الشريحة" aria-label={`اسم الشريحة ${index + 1}`} /><label className="text-xs text-charcoal-500">الاحتمال %<input className="field mt-1" type="number" min="0.1" max="100" step="0.1" value={slice.probability} onChange={(event) => updateSlice(index, { probability: Number(event.target.value) })} /></label><input className="mt-5 size-10 cursor-pointer rounded-md border border-moon-face-200 p-1" type="color" value={slice.color} onChange={(event) => updateSlice(index, { color: event.target.value })} aria-label={`لون الشريحة ${index + 1}`} /></div>
        <div className="grid grid-cols-[1fr_7rem_auto] items-end gap-2"><label className="text-xs text-charcoal-500">نوع الجائزة<select className="field mt-1" value={slice.rewardType} onChange={(event) => updateSlice(index, { rewardType: event.target.value as WheelSlice['rewardType'], rewardValue: event.target.value === 'none' ? 0 : slice.rewardValue })}><option value="discount">كود خصم</option><option value="points">نقاط ولاء</option><option value="none">لا جائزة</option></select></label><label className="text-xs text-charcoal-500">{slice.rewardType === 'discount' ? 'الخصم %' : 'عدد النقاط'}<input className="field mt-1" type="number" min={slice.rewardType === 'points' ? 1 : 0} max={slice.rewardType === 'discount' ? 100 : undefined} step="1" disabled={slice.rewardType === 'none'} value={slice.rewardValue} onChange={(event) => updateSlice(index, { rewardValue: Number(event.target.value) })} /></label><button type="button" onClick={() => update({ ...config, slices: config.slices.filter((_, sliceIndex) => sliceIndex !== index) })} aria-label={`حذف الشريحة ${slice.label || index + 1}`} className="mb-1 p-2 text-red-700"><Trash2 size={17} /></button></div>
      </div>)}</div>
      <button type="button" onClick={addSlice} disabled={config.slices.length >= 12} className="w-full border border-[#563C2E] py-2 text-sm font-semibold text-[#563C2E] disabled:opacity-40">إضافة شريحة</button>
    </section>
    <button type="button" onClick={onSave} disabled={saving || config.slices.length < 2 || Math.abs(totalProbability - 100) > 0.01} className="w-full rounded-lg bg-[#3B2A22] py-3 font-bold text-white disabled:opacity-50">{saving ? 'جارٍ الحفظ...' : 'حفظ إعدادات العجلة'}</button>
  </div>;
}

function ProductsTab({ draft, productTypes, update, onDraftChange, onSave, saving, readImages, onError }: { draft: Product[]; productTypes: string[]; update: (index: number, change: Partial<Product>) => void; onDraftChange: Dispatch<SetStateAction<Product[]>>; onSave: (products?: Product[]) => Promise<void>; saving: boolean; readImages: (files: FileList | null, onRead: (images: string[]) => void) => void; onError: (message: string) => void }) {
  const [newProduct, setNewProduct] = useState<Product>(() => createEmptyProduct(1));
  const [productSection, setProductSection] = useState<'add' | 'existing'>('add');
  const [draggedProductIndex, setDraggedProductIndex] = useState<number | null>(null);
  const nextId = useMemo(() => draft.reduce((highest, product) => Math.max(highest, product.id), 0) + 1, [draft]);

  const reorderProducts = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= draft.length || to >= draft.length) return;
    onDraftChange((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDraggedProductIndex(null);
  };

  const updateNewProduct = (change: Partial<Product>) => setNewProduct((current) => ({ ...current, ...change }));
  const updateNewColors = (colors: Product['colors']) => updateNewProduct({
    colors,
    images: colors.flatMap((color) => (color.images?.length ? color.images : [color.image]).filter(Boolean).map((image) => ({ color: color.name, img: image }))),
    image: colors.find((color) => color.image)?.image || newProduct.image,
  });
  const addProduct = async () => {
    if (saving || !newProduct.name.trim() || !newProduct.nameAr.trim() || !newProduct.colors.some((color) => color.name.trim() && color.image)) return;
    const colors = newProduct.colors
      .filter((color) => color.name.trim() && color.image)
      .map((color) => ({ ...color, name: color.name.trim(), images: color.images?.length ? color.images : [color.image] }));
    const images = colors.flatMap((color) => color.images!.map((image) => ({ color: color.name, img: image })));
    const product = {
      ...newProduct,
      category: newProduct.category.trim() || newProduct.name.trim(),
      id: nextId,
      colors,
      images,
      colorName: colors[0].name,
      image: colors[0].image,
      media: newProduct.media || [],
    };
    const nextProducts = [product, ...draft];
    try {
      await onSave(nextProducts);
      onDraftChange(nextProducts);
    } catch {
      return;
    }
    setNewProduct(createEmptyProduct(nextId + 1));
  };

  const deleteProduct = async (product: Product) => {
    if (saving || !window.confirm(`سيتم نقل ${product.nameAr || product.name} إلى أرشيف المنتجات. هل تريد المتابعة؟`)) return;
    const nextProducts = draft.filter((item) => item.id !== product.id);
    try {
      await onSave(nextProducts);
      onDraftChange(nextProducts);
    } catch {
      return;
    }
  };

  return <>
    <div className="grid grid-cols-2 gap-2 mb-4">
      <button type="button" onClick={() => setProductSection('add')} className={`py-3 rounded-xl font-bold ${productSection === 'add' ? 'bg-[#3B2A22] text-white' : 'bg-white'}`}>+ إضافة منتج</button>
      <button type="button" onClick={() => setProductSection('existing')} className={`py-3 rounded-xl font-bold ${productSection === 'existing' ? 'bg-[#3B2A22] text-white' : 'bg-white'}`}>المنتجات الموجودة ({draft.length})</button>
    </div>
    {productSection === 'add' && <div className="bg-moon-face-100 rounded-2xl p-4 shadow-sm border border-moon-face-200">
      <div className="flex items-center gap-2 mb-1"><Plus size={19} className="text-moon-face-700" /><h3 className="font-bold text-lg">إضافة منتج جديد</h3></div>
      <p className="text-xs text-charcoal-500 mb-4">أضف المنتج هنا بشكل مستقل، ثم اضغط حفظ المنتجات بعد الانتهاء.</p>
      <div className="grid grid-cols-2 gap-2">
        <input className="field" value={newProduct.name} onChange={(e) => updateNewProduct({ name: e.target.value })} placeholder="اسم المنتج" />
        <input className="field" value={newProduct.nameAr} onChange={(e) => updateNewProduct({ nameAr: e.target.value })} placeholder="الاسم بالعربي" />
        <input className="field" value={newProduct.category} onChange={(e) => updateNewProduct({ category: e.target.value })} placeholder="التصنيف" />
        <input className="field" type="number" value={newProduct.price || ''} onChange={(e) => updateNewProduct({ price: Number(e.target.value) })} placeholder="السعر" />
        <input className="field" type="number" value={newProduct.originalPrice || ''} onChange={(e) => updateNewProduct({ originalPrice: Number(e.target.value) })} placeholder="السعر قبل الخصم" />
        <select className="field" value={newProduct.badge} onChange={(e) => updateNewProduct({ badge: e.target.value })} aria-label="تصنيف المنتج">
          {productBadgeOptions.map((badge) => <option key={badge} value={badge}>{badge || 'بدون شارة'}</option>)}
        </select>
        <div className="field-wrapper">
          <input
            list="product-type-suggestions"
            className="field"
            value={newProduct.productType || ''}
            onChange={(e) => updateNewProduct({ productType: e.target.value })}
            placeholder="اكتب نوع المنتج"
            aria-label="نوع المنتج"
          />
          <datalist id="product-type-suggestions">
            {productTypes.map((type) => <option key={type} value={type} />)}
          </datalist>
        </div>
      </div>
      <textarea className="field mt-2 min-h-24 resize-y" value={newProduct.description || ''} onChange={(event) => updateNewProduct({ description: event.target.value })} placeholder="وصف المنتج" aria-label="وصف المنتج" />
      <div className="mt-4 border-t border-moon-face-200 pt-3">
        <p className="font-bold text-sm mb-2">الألوان — صور وفيديوهات مستقلة لكل لون</p>
        <div className="space-y-3">{newProduct.colors.map((color, colorIndex) => <div key={`new-color-${colorIndex}`} className="rounded-xl bg-white p-2">
          <div className="flex gap-2 items-center">
            <input className="field" value={color.name} onChange={(e) => updateNewColors(newProduct.colors.map((item, index) => index === colorIndex ? { ...item, name: e.target.value } : item))} placeholder="اسم اللون" />
            <button type="button" aria-label="حذف اللون" onClick={() => updateNewColors(newProduct.colors.filter((_, index) => index !== colorIndex))} className="p-2 text-red-500"><Trash2 size={15} /></button>
          </div>
          <ColorMediaEditor color={color} readImages={readImages} onChange={(nextColor) => updateNewColors(newProduct.colors.map((item, index) => index === colorIndex ? nextColor : item))} />
        </div>)}</div>
        <button type="button" onClick={() => updateNewColors([...newProduct.colors, { name: '', available: true, image: '' }])} className="mt-2 text-xs text-moon-face-700">+ إضافة لون</button>
      </div>
<button 
  type="button" 
  onClick={addProduct} 
  disabled={saving || !newProduct.name.trim() || !newProduct.nameAr.trim() || !newProduct.colors.some((color) => color.name.trim() && color.image)}
  className="w-full mt-4 py-3 rounded-xl bg-[#3B2A22] text-white font-bold shadow-md hover:bg-black transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
>
  {saving ? 'جارٍ الحفظ...' : 'إضافة المنتج للقائمة'}
</button>    </div>}
    {productSection === 'existing' && <div className="space-y-4">{draft.map((product, index) => {
      const colors = product.colors?.length ? product.colors : product.images.map((item) => ({ name: item.color, available: true, image: item.img, images: [item.img] }));
      const setColors = (next: Product['colors']) => update(index, { colors: next, images: next.flatMap((item) => (item.images?.length ? item.images : [item.image]).filter(Boolean).map((image) => ({ color: item.name, img: image }))) });
      return <div key={product.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData('text/plain')); if (Number.isInteger(from)) reorderProducts(from, index); }} className={`bg-white rounded-2xl p-4 shadow-sm transition-opacity ${draggedProductIndex === index ? 'opacity-50' : ''}`}>
        <div className="mb-3 flex items-center justify-between border-b border-moon-face-100 pb-2">
          <button type="button" draggable onDragStart={(event) => { setDraggedProductIndex(index); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); }} onDragEnd={() => setDraggedProductIndex(null)} aria-label={`اسحب لتغيير ترتيب ${product.nameAr || product.name}`} title="اسحب لتغيير الترتيب" className="cursor-grab touch-none rounded-md p-2 text-charcoal-500 active:cursor-grabbing"><GripVertical size={19} /></button>
          <div className="flex gap-1">
            <button type="button" disabled={index === 0} onClick={() => reorderProducts(index, index - 1)} aria-label="تحريك المنتج للأعلى" className="rounded-md p-2 text-charcoal-600 hover:bg-moon-face-100 disabled:opacity-30"><ChevronUp size={18} /></button>
            <button type="button" disabled={index === draft.length - 1} onClick={() => reorderProducts(index, index + 1)} aria-label="تحريك المنتج للأسفل" className="rounded-md p-2 text-charcoal-600 hover:bg-moon-face-100 disabled:opacity-30"><ChevronDown size={18} /></button>
            <button type="button" disabled={saving} onClick={() => void deleteProduct(product)} aria-label={`أرشفة المنتج ${product.nameAr || product.name}`} title="أرشفة المنتج" className="rounded-md p-2 text-amber-700 hover:bg-amber-50 disabled:opacity-40"><Archive size={18} /></button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2"><input className="field" value={product.name} onChange={(e) => update(index, { name: e.target.value })} placeholder="اسم المنتج" /><input className="field" value={product.nameAr} onChange={(e) => update(index, { nameAr: e.target.value })} placeholder="الاسم بالعربي" /><input className="field" value={product.category} onChange={(e) => update(index, { category: e.target.value })} placeholder="التصنيف" /><input className="field" type="number" value={product.price || ''} onChange={(e) => update(index, { price: Number(e.target.value) })} placeholder="السعر بعد الخصم" /><input className="field" type="number" value={product.originalPrice || ''} onChange={(e) => update(index, { originalPrice: Number(e.target.value) })} placeholder="السعر قبل الخصم (اختياري)" /><select className="field" value={product.badge} onChange={(e) => update(index, { badge: e.target.value })} aria-label={`تصنيف ${product.name}`}>
          {product.badge && !productBadgeOptions.includes(product.badge) && <option value={product.badge}>{product.badge}</option>}
          {productBadgeOptions.map((badge) => <option key={badge} value={badge}>{badge || 'بدون شارة'}</option>)}
        </select></div>
        <textarea className="field mt-2 min-h-24 resize-y" value={product.description || ''} onChange={(event) => update(index, { description: event.target.value })} placeholder="وصف المنتج" aria-label={`وصف ${product.name}`} />
        <label className="block text-xs text-charcoal-500 mt-3">
          نوع المنتج
          <input
            list="product-type-suggestions-existing"
            className="field mt-1"
            value={product.productType || ''}
            onChange={(e) => update(index, { productType: e.target.value })}
            placeholder="اكتب نوع المنتج"
            aria-label={`نوع المنتج ${product.name}`}
          />
          <datalist id="product-type-suggestions-existing">
            {productTypes.map((type) => <option key={type} value={type} />)}
          </datalist>
        </label>
        <label className="block text-xs text-charcoal-500 mt-3">الصورة الرئيسية للمنتج<input type="file" accept="image/*" className="field mt-1 text-xs" onChange={(e) => readImage(e.target.files?.[0], (image) => update(index, { image }), onError)} /></label>
        <div className="mt-4 border-t pt-3"><p className="font-bold text-sm mb-2">الألوان والصور والفيديو والتوفر</p><div className="space-y-3">{colors.map((color, colorIndex) => <div key={`${color.name}-${colorIndex}`} className="rounded-xl bg-moon-face-50 p-2"><div className="flex gap-2 items-center"><input className="field" value={color.name} onChange={(e) => setColors(colors.map((item, i) => i === colorIndex ? { ...item, name: e.target.value } : item))} placeholder="اسم اللون" /><button onClick={() => setColors(colors.map((item, i) => i === colorIndex ? { ...item, available: !item.available } : item))} className={`px-3 py-2 rounded-lg text-xs whitespace-nowrap ${color.available ? 'availability-available' : 'availability-unavailable'}`}>{color.available ? 'اللون متوفر' : 'اللون غير متوفر'}</button></div><ColorMediaEditor color={color} readImages={readImages} onChange={(nextColor) => setColors(colors.map((item, i) => i === colorIndex ? nextColor : item))} /></div>)}</div><button onClick={() => setColors([...colors, { name: '', available: true, image: '', images: [], media: [] }])} className="mt-2 text-xs text-moon-face-700">+ إضافة لون</button></div>
      </div>;
    })}</div>}
    <button disabled={saving} onClick={() => void onSave()} className="w-full mt-6 py-4 rounded-xl bg-[#3B2A22] text-white font-bold transition-opacity disabled:cursor-wait disabled:opacity-60">{saving ? 'جارٍ الحفظ...' : 'حفظ تعديلات المنتجات'}</button>
  </>;
}

function createEmptyProduct(id: number): Product {
  return {
    id,
    name: '',
    nameAr: '',
    category: '',
    productType: '',
    colorName: '',
    price: 0,
    originalPrice: 0,
    rating: 0,
    reviews: 0,
    badge: '',
    image: '',
    images: [],
    media: [],
    sizes: [],
    colors: [{ name: '', available: true, image: '', images: [], media: [] }],
  };
}

function isWebUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function ProductMediaEditor({ value, onChange, readMediaFiles }: { value: NonNullable<Product['media']>; onChange: (media: NonNullable<Product['media']>) => void; readMediaFiles: (files: FileList | null, onRead: (media: NonNullable<Product['media']>) => void) => void }) {
  const [videoUrl, setVideoUrl] = useState('');
  const addVideo = () => {
    if (!isWebUrl(videoUrl)) return;
    onChange([...value, { type: 'video', url: videoUrl.trim() }]);
    setVideoUrl('');
  };

  return <div className="mt-4 border-t border-moon-face-200 pt-3">
    <div className="mb-2 flex items-center justify-between gap-3">
      <div><p className="text-sm font-bold">صور وفيديو المنتج</p><p className="mt-1 text-sm leading-6 text-charcoal-600">ارفع الصور أو أضف رابط فيديو مباشر أو رابطًا من YouTube أو Vimeo أو TikTok أو Instagram أو Facebook.</p></div>
      <label className="cursor-pointer rounded-full border border-moon-face-300 px-3 py-2 text-xs font-semibold text-moon-face-800 hover:bg-moon-face-100">
        إضافة صور
        <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => readMediaFiles(event.target.files, (media) => onChange([...value, ...media]))} />
      </label>
    </div>
    <div className="flex gap-2">
      <input type="url" dir="ltr" className="field min-w-0" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="MP4 أو YouTube / Vimeo / TikTok / Instagram" aria-label="رابط فيديو المنتج" />
      <button type="button" onClick={addVideo} disabled={!isWebUrl(videoUrl)} className="shrink-0 bg-[#563C2E] px-3 text-sm font-semibold text-white disabled:opacity-40">إضافة رابط</button>
    </div>
    {!!value.length && <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
      {value.map((item, index) => <div key={`${item.type}-${item.url}-${index}`} className="relative h-24 w-20 shrink-0 overflow-hidden rounded-md bg-moon-face-100">
        <StoredMedia type={item.type} source={item.url} alt={`وسيط ${index + 1}`} controls={item.type === 'video'} className="h-full w-full object-cover" />
        <button type="button" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/70 text-white" aria-label={`حذف الوسيط ${index + 1}`}><X size={14} /></button>
      </div>)}
    </div>}
  </div>;
}

function ColorMediaEditor({ color, onChange, readImages }: { color: Product['colors'][number]; onChange: (color: Product['colors'][number]) => void; readImages: (files: FileList | null, onRead: (images: string[]) => void) => void }) {
  const [videoUrl, setVideoUrl] = useState('');
  const imageMedia = (color.images?.length ? color.images : color.image ? [color.image] : []).map((url) => ({ type: 'image' as const, url }));
  const value = [...imageMedia, ...(color.media || [])].filter((item, index, media) => media.findIndex((candidate) => candidate.type === item.type && candidate.url === item.url) === index);
  const updateMedia = (media: NonNullable<Product['media']>) => {
    const images = media.filter((item) => item.type === 'image').map((item) => item.url);
    onChange({ ...color, media, image: images[0] || '', images });
  };
  const addVideo = () => {
    if (!isWebUrl(videoUrl)) return;
    updateMedia([...value, { type: 'video', url: videoUrl.trim() }]);
    setVideoUrl('');
  };

  return <div className="mt-2 space-y-2">
    <label className="flex w-fit items-center gap-2 text-xs font-semibold text-charcoal-600">
      <span>لون دائرة اللون</span>
      <input type="color" value={color.customColor || getProductColorHex(color.name)} onChange={(event) => onChange({ ...color, customColor: event.target.value })} className="size-10 cursor-pointer rounded-md border border-moon-face-200 bg-white p-1" aria-label={`لون دائرة ${color.name || 'اللون'}`} />
      {color.customColor && <button type="button" onClick={() => onChange({ ...color, customColor: undefined })} className="grid size-8 place-items-center rounded-md text-charcoal-500 hover:bg-moon-face-100" aria-label={`استعادة اللون التلقائي ${color.name}`} title="استعادة اللون التلقائي"><RotateCcw size={15} /></button>}
    </label>
    <label className="flex cursor-pointer items-center gap-2 text-xs text-charcoal-500"><ImagePlus size={16} /> إضافة صور لهذا اللون
      <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => readImages(event.target.files, (images) => updateMedia([...value, ...images.map((url) => ({ type: 'image' as const, url }))]))} />
    </label>
    <div className="flex gap-2">
      <input type="url" dir="ltr" className="field min-w-0" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="رابط فيديو هذا اللون" aria-label={`رابط فيديو ${color.name || 'اللون'}`} />
      <button type="button" onClick={addVideo} disabled={!isWebUrl(videoUrl)} className="shrink-0 bg-[#563C2E] px-3 text-sm font-semibold text-white disabled:opacity-40">إضافة فيديو</button>
    </div>
    {!!value.length && <div className="flex gap-2 overflow-x-auto pb-2">
      {value.map((item, index) => <div key={`${item.type}-${item.url}-${index}`} className="relative h-24 w-20 shrink-0 overflow-hidden rounded-md bg-white">
        <StoredMedia type={item.type} source={item.url} alt={`${color.name || 'اللون'} · ${index + 1}`} controls={item.type === 'video'} className="h-full w-full object-contain" />
        <button type="button" onClick={() => updateMedia(value.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/70 text-white" aria-label={`حذف وسيط ${color.name} ${index + 1}`}><X size={14} /></button>
      </div>)}
    </div>}
  </div>;
}

function readImage(file: File | undefined, onRead: (image: string) => void, onError: (message: string) => void) {
  if (!file) return;
  void uploadOptimizedImage(file).then(onRead).catch(() => onError('تعذر رفع الصورة. تحقق من الاتصال وصلاحيات تخزين الصور.'));
}

async function uploadOptimizedImage(file: File) {
  return saveUploadedMedia(await optimizeImage(file), file.name);
}

async function uploadOptimizedImages(files: File[]) {
  const urls: string[] = [];
  for (const file of files) urls.push(await uploadOptimizedImage(file));
  return urls;
}

function ContentTab({ draft, products, update, onSave, readMediaFiles, onError, saving, saved }: { draft: SiteContent; products: Product[]; update: (content: SiteContent) => void; onSave: () => void; readMediaFiles: (files: FileList | null, onRead: (media: NonNullable<Product['media']>) => void) => void; onError: (message: string) => void; saving: boolean; saved: boolean }) {
  const [newProductType, setNewProductType] = useState('');
  const [tutorialVideoUrl, setTutorialVideoUrl] = useState('');
  const [reelVideoUrl, setReelVideoUrl] = useState('');
  const setHero = (change: Partial<SiteContent['hero']>) => update({ ...draft, hero: { ...draft.hero, ...change } });
  const setStory = (change: Partial<SiteContent['story']>) => update({ ...draft, story: { ...draft.story, ...change } });
  const setTutorials = (change: Partial<SiteContent['tutorials']>) => update({ ...draft, tutorialsConfigured: true, tutorials: { ...draft.tutorials, ...change } });
  const setReels = (change: Partial<SiteContent['reels']>) => update({ ...draft, reelsConfigured: true, reels: { ...draft.reels, ...change } });
  const setPolicies = (change: Partial<SiteContent['policies']>) => update({ ...draft, policies: { ...draft.policies, ...change } });
  const addProductType = () => {
    const type = newProductType.trim();
    if (!type || draft.productTypes.includes(type)) return;
    update({ ...draft, productTypes: [...draft.productTypes, type] });
    setNewProductType('');
  };
  return <div className="space-y-5">
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <h3 className="font-bold text-lg">هوية المتجر والطلبات</h3>
      <label className="block text-sm font-semibold">شعار المتجر<input className="field mt-1" value={draft.storeLogo} onChange={(event) => update({ ...draft, storeLogo: event.target.value })} placeholder="رابط الشعار أو ارفع صورة" /><input type="file" accept="image/*" className="field mt-1 text-xs" onChange={(event) => readImage(event.target.files?.[0], (storeLogo) => update({ ...draft, storeLogo }), onError)} />{draft.storeLogo && <StoredMedia type="image" source={draft.storeLogo} alt="معاينة شعار المتجر" className="mt-2 h-24 w-40 rounded-lg bg-moon-face-50 object-contain p-2" />}</label>
      <label className="block text-sm font-semibold">رقم واتساب لاستقبال الطلبات<input className="field mt-1" type="tel" inputMode="tel" dir="ltr" value={draft.whatsappNumber} onChange={(event) => update({ ...draft, whatsappNumber: event.target.value })} placeholder="مثال: 9705XXXXXXXX" /><span className="mt-1 block text-xs font-normal text-charcoal-500">اكتب رمز الدولة ثم الرقم، من دون + أو مسافات. بعد حفظ الطلب سيفتح واتساب برسالة تفاصيله.</span></label>
    </div>
    <label className="flex items-center justify-between gap-4 border-b border-moon-face-200 bg-[#563C2E] p-4 text-white">
      <span><span className="block font-bold">قسم العروض</span><span className="mt-1 block text-xs text-white/70">إظهار العروض الخاصة أو إخفاؤها من المتجر</span></span>
      <input type="checkbox" checked={draft.offersEnabled} onChange={(event) => update({ ...draft, offersEnabled: event.target.checked, offersEnabledConfigured: true })} className="size-5 accent-[#b8bea0]" />
    </label>
    <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
      <h3 className="font-bold text-lg">محتوى الهيرو</h3>
      <input className="field" value={draft.hero.eyebrow} onChange={(e) => setHero({ eyebrow: e.target.value })} placeholder="النص الصغير" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2"><input className="field" value={draft.hero.titleLine1} onChange={(e) => setHero({ titleLine1: e.target.value })} placeholder="السطر الأول" /><input className="field" value={draft.hero.titleLine2} onChange={(e) => setHero({ titleLine2: e.target.value })} placeholder="السطر الثاني" /><input className="field" value={draft.hero.titleLine3} onChange={(e) => setHero({ titleLine3: e.target.value })} placeholder="السطر الثالث" /></div>
      <textarea className="field min-h-24 resize-y" value={draft.hero.description} onChange={(e) => setHero({ description: e.target.value })} placeholder="وصف الهيرو" />
      <input className="field" value={draft.hero.primaryButton} onChange={(e) => setHero({ primaryButton: e.target.value })} placeholder="نص زر التصفح" />
      <ProductMediaEditor value={draft.hero.media} onChange={(media) => setHero({ media })} readMediaFiles={readMediaFiles} />
    </div>
    <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
      <h3 className="font-bold text-lg">من نحن</h3>
      <input className="field" value={draft.story.eyebrow} onChange={(e) => setStory({ eyebrow: e.target.value })} placeholder="العنوان الصغير" />
      <div className="grid grid-cols-2 gap-2"><input className="field" value={draft.story.title} onChange={(e) => setStory({ title: e.target.value })} placeholder="العنوان" /><input className="field" value={draft.story.highlight} onChange={(e) => setStory({ highlight: e.target.value })} placeholder="العنوان المميز" /></div>
      <textarea className="field min-h-24 resize-y" value={draft.story.description} onChange={(e) => setStory({ description: e.target.value })} placeholder="وصف القسم" />
      {draft.story.features.map((feature, index) => <div key={index} className="rounded-xl bg-moon-face-50 p-3 space-y-2"><input className="field" value={feature.title} onChange={(e) => setStory({ features: draft.story.features.map((item, i) => i === index ? { ...item, title: e.target.value } : item) })} placeholder={`عنوان الميزة ${index + 1}`} /><textarea className="field min-h-20 resize-y" value={feature.description} onChange={(e) => setStory({ features: draft.story.features.map((item, i) => i === index ? { ...item, description: e.target.value } : item) })} placeholder="تفاصيل الميزة" /></div>)}
    </div>
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <h3 className="font-bold text-lg">الشروحات</h3>
      <input className="field" value={draft.tutorials.title} onChange={(event) => setTutorials({ title: event.target.value })} placeholder="عنوان القسم" />
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-moon-face-300 px-4 py-3 text-sm font-semibold text-moon-face-800 hover:bg-moon-face-100">
        <ImagePlus size={17} /> إضافة صور
        <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => readMediaFiles(event.target.files, (media) => setTutorials({ entries: [...draft.tutorials.entries, ...media.map((item) => ({ ...item, title: '', description: '' }))] }))} />
      </label>
      <div className="flex gap-2">
        <input type="url" dir="ltr" className="field min-w-0" value={tutorialVideoUrl} onChange={(event) => setTutorialVideoUrl(event.target.value)} placeholder="MP4 أو YouTube / Vimeo / TikTok / Instagram" aria-label="رابط فيديو الشرح" />
        <button type="button" disabled={!isWebUrl(tutorialVideoUrl)} onClick={() => { setTutorials({ entries: [...draft.tutorials.entries, { type: 'video', url: tutorialVideoUrl.trim(), title: '', description: '' }] }); setTutorialVideoUrl(''); }} className="shrink-0 bg-[#563C2E] px-3 text-sm font-semibold text-white disabled:opacity-40">إضافة رابط</button>
      </div>
      {draft.tutorials.entries.map((entry, index) => <div key={`${entry.url}-${index}`} className="space-y-2 border-t border-moon-face-200 pt-3">
        <StoredMedia type={entry.type} source={entry.url} alt={`شرح ${index + 1}`} controls={entry.type === 'video'} className="aspect-video w-full rounded-lg object-cover" />
        <input className="field" value={entry.title} onChange={(event) => setTutorials({ entries: draft.tutorials.entries.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) })} placeholder={`عنوان الشرح ${index + 1}`} />
        <textarea className="field min-h-20 resize-y" value={entry.description} onChange={(event) => setTutorials({ entries: draft.tutorials.entries.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item) })} placeholder={`شرح الصورة أو الفيديو ${index + 1}`} />
        <button type="button" onClick={() => setTutorials({ entries: draft.tutorials.entries.filter((_, itemIndex) => itemIndex !== index) })} className="text-sm font-semibold text-red-600">حذف الوسيط</button>
      </div>)}
    </div>
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <h3 className="font-bold text-lg">الريلز</h3>
      <div className="flex gap-2">
        <input type="url" dir="ltr" className="field min-w-0" value={reelVideoUrl} onChange={(event) => setReelVideoUrl(event.target.value)} placeholder="رابط فيديو من Instagram أو YouTube أو منصة أخرى" aria-label="رابط فيديو الريل" />
        <button type="button" disabled={!isWebUrl(reelVideoUrl)} onClick={() => { setReels({ entries: [...draft.reels.entries, { id: crypto.randomUUID(), url: reelVideoUrl.trim(), productId: products[0]?.id || 0, caption: '' }] }); setReelVideoUrl(''); }} className="shrink-0 bg-[#563C2E] px-3 text-sm font-semibold text-white disabled:opacity-40">إضافة رابط</button>
      </div>
      <p className="text-xs text-charcoal-500">يُحفظ الرابط فقط دون رفع الفيديو. روابط YouTube وVimeo وTikTok وInstagram وFacebook مدعومة؛ قد يتطلب تشغيلها أن يكون الفيديو عامًا ويسمح بالتضمين.</p>
      {!products.length && <p className="text-sm text-charcoal-500">أضيفي المنتجات أولًا لربط التفاعل بالمنتج.</p>}
      {draft.reels.entries.map((reel, index) => <div key={reel.id} className="space-y-2 border-t border-moon-face-200 pt-3">
        <StoredMedia type="video" source={reel.url} alt={reel.caption || `ريل ${index + 1}`} controls className="aspect-[9/16] max-h-80 w-full rounded-lg bg-[#2E241D] object-cover" />
        <select className="field" value={products.some((product) => product.id === reel.productId) ? String(reel.productId) : ''} onChange={(event) => setReels({ entries: draft.reels.entries.map((item, itemIndex) => itemIndex === index ? { ...item, productId: Number(event.target.value) } : item) })} aria-label={`المنتج المرتبط بالريل ${index + 1}`}>
          <option value="" disabled>اختاري المنتج المرتبط</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.nameAr || product.name}</option>)}
        </select>
        <textarea className="field min-h-20 resize-y" value={reel.caption} onChange={(event) => setReels({ entries: draft.reels.entries.map((item, itemIndex) => itemIndex === index ? { ...item, caption: event.target.value } : item) })} placeholder="وصف الريل" />
        <button type="button" onClick={() => setReels({ entries: draft.reels.entries.filter((_, itemIndex) => itemIndex !== index) })} className="text-sm font-semibold text-red-600">حذف الريل</button>
      </div>)}
    </div>
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <h3 className="font-bold text-lg">استقبال الآراء والملاحظات</h3>
      <label className="block text-sm font-semibold">بريد الاستقبال<input className="field mt-1" type="email" value={draft.feedbackEmail} onChange={(event) => update({ ...draft, feedbackEmail: event.target.value })} placeholder="name@example.com" /></label>
    </div>
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <h3 className="text-lg font-bold">سياسات المتجر</h3>
      <label className="block text-sm font-semibold">سياسة التوصيل<textarea className="field mt-1 min-h-20 resize-y" value={draft.policies.delivery} onChange={(event) => setPolicies({ delivery: event.target.value })} placeholder="اكتب تفاصيل التوصيل ورسومه" /></label>
      <label className="block text-sm font-semibold">سياسة التبديل<textarea className="field mt-1 min-h-20 resize-y" value={draft.policies.exchange} onChange={(event) => setPolicies({ exchange: event.target.value })} placeholder="اكتب شروط التبديل" /></label>
      <label className="block text-sm font-semibold">سياسة الترجيع<textarea className="field mt-1 min-h-20 resize-y" value={draft.policies.returns} onChange={(event) => setPolicies({ returns: event.target.value })} placeholder="اكتب شروط الترجيع" /></label>
    </div>
    <div className="rounded-2xl border border-moon-face-200 bg-moon-face-50/70 p-4 shadow-sm space-y-3">
      <div><h3 className="font-bold text-lg">أنواع المنتجات</h3><p className="text-xs text-charcoal-500">أنشئ الأقسام التي ستظهر في المتجر، ثم اختر النوع عند إضافة المنتج.</p></div>
      <div className="flex gap-2">
        <input className="field min-w-0" value={newProductType} onChange={(event) => setNewProductType(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addProductType()} placeholder="اسم النوع" aria-label="اسم النوع الجديد" />
        <button type="button" onClick={addProductType} disabled={!newProductType.trim() || draft.productTypes.includes(newProductType.trim())} className="shrink-0 rounded-md bg-[#563C2E] px-4 text-sm font-semibold text-white disabled:opacity-40">إضافة</button>
      </div>
      <div className="divide-y divide-moon-face-200">
        {draft.productTypes.map((type) => <div key={type} className="flex items-center justify-between gap-3 py-2"><span>{type}</span><button type="button" onClick={() => update({ ...draft, productTypes: draft.productTypes.filter((item) => item !== type) })} aria-label={`حذف نوع ${type}`} className="grid size-8 place-items-center rounded-full text-red-600 hover:bg-red-50"><X size={16} /></button></div>)}
        {!draft.productTypes.length && <p className="py-3 text-sm text-charcoal-500">لم تضف أنواعًا بعد.</p>}
      </div>
    </div>
    <motion.button type="button" onClick={() => void onSave()} disabled={saving} aria-busy={saving} whileTap={saving ? undefined : { scale: 0.98 }} animate={saved ? { scale: [1, 1.015, 1] } : { scale: 1 }} transition={{ duration: 0.3 }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3B2A22] py-4 font-bold text-white disabled:cursor-wait disabled:opacity-70">
      {saving ? <><motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}><LoaderCircle size={18} /></motion.span> جارٍ حفظ محتوى الموقع...</> : saved ? <><motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}><Check size={18} /></motion.span> تم حفظ المحتوى</> : 'حفظ محتوى الموقع'}
    </motion.button>
  </div>;
}

const orderStatusOptions: { value: OrderStatus; label: string }[] = [
  { value: 'new', label: 'جديد' },
  { value: 'cancelled', label: 'ملغي' },
  { value: 'postponed', label: 'مؤجل' },
  { value: 'delivered', label: 'تم التسليم' },
  { value: 'exchanged', label: 'مبدل' },
];

function englishDigits(value: string | number) {
  return String(value).replace(/[٠-٩۰-۹]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit) >= 0 ? '٠١٢٣٤٥٦٧٨٩'.indexOf(digit) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function formatOrderNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function formatOrderDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatOrderMoney(value: number) {
  return `₪${formatOrderNumber(value)}`;
}

function ActivityTab({ activity, loading, onRefresh, onError }: { activity: OwnerActivity; loading: boolean; onRefresh: () => Promise<void>; onError: (message: string) => void }) {
  const moderate = async (id: string, approved: boolean) => {
    onError('');
    try { await moderateProductComment(id, approved); await onRefresh(); }
    catch { onError('تعذر تحديث التعليق.'); }
  };
  const remove = async (id: string) => {
    if (!window.confirm('حذف هذا التعليق نهائيًا؟')) return;
    onError('');
    try { await deleteProductComment(id); await onRefresh(); }
    catch { onError('تعذر حذف التعليق.'); }
  };

  return <div className="space-y-6">
    <div className="flex items-center justify-between"><div><h3 className="font-bold">تفاعلات العملاء</h3><p className="mt-1 text-xs text-charcoal-500">{activity.likes.length} إعجاب · {activity.saves.length} حفظ · {activity.comments.length} تعليق</p></div><button type="button" onClick={() => void onRefresh()} disabled={loading} className="grid size-10 place-items-center border border-moon-face-200 bg-white disabled:opacity-40" aria-label="تحديث التفاعلات"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /></button></div>
    {loading ? <p className="py-8 text-center text-sm text-charcoal-500">جارٍ التحميل...</p> : <>
      <section><h4 className="mb-2 text-sm font-bold">الإعجابات والحفظ</h4><div className="divide-y divide-moon-face-200 border-y border-moon-face-200">{[...activity.likes.map((item: any) => ({ ...item, kind: 'أعجب بالمنتج' })), ...activity.saves.map((item: any) => ({ ...item, kind: 'حفظ المنتج' }))].map((item: any, index) => <div key={`${item.kind}-${item.user_id}-${item.product_id}-${index}`} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{item.profile?.display_name || item.profile?.email || 'عميل'} <span className="text-charcoal-500">{item.kind}</span></span><b>#{item.product_id}</b></div>)}{!activity.likes.length && !activity.saves.length && <p className="py-6 text-center text-xs text-charcoal-500">لا توجد تفاعلات بعد.</p>}</div></section>
      <section><h4 className="mb-2 text-sm font-bold">التعليقات والتقييمات</h4><div className="space-y-3">{activity.comments.map((comment: any) => <article key={comment.id} className="border-b border-moon-face-200 pb-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-charcoal-500">{comment.profile?.display_name || comment.profile?.email || comment.display_name || 'عميل'} · المنتج #{comment.product_id}</p>{comment.rating && <p className="mt-1 text-xs font-semibold text-amber-700">التقييم: {comment.rating} / 5 نجوم</p>}<p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p></div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => void moderate(comment.id, !comment.is_approved)} className="px-2 py-1 text-[11px] text-moon-face-800 hover:bg-moon-face-100">{comment.is_approved ? 'إخفاء' : 'إظهار'}</button><button type="button" onClick={() => void remove(comment.id)} aria-label="حذف التعليق" className="grid size-8 place-items-center text-red-700 hover:bg-red-50"><Trash2 size={15} /></button></div></div></article>)}{!activity.comments.length && <p className="py-6 text-center text-xs text-charcoal-500">لا توجد تعليقات بعد.</p>}</div></section>
    </>}
  </div>;
}

function getOrderAmounts(order: Order) {
  const subtotal = order.subtotal ?? order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = order.discount || 0;
  const deliveryFee = order.deliveryFee ?? Math.max(0, order.total - subtotal + discount);
  return { subtotal, discount, deliveryFee };
}

function OrdersTab({ orders, products, loading, onOrdersChange, onError }: { orders: Order[]; products: Product[]; loading: boolean; onOrdersChange: Dispatch<SetStateAction<Order[]>>; onError: (message: string) => void }) {
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [category, setCategory] = useState('');
  const [savingStatusIds, setSavingStatusIds] = useState<Set<number>>(() => new Set());
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null);
  const categories = useMemo(() => [...new Set(orders.flatMap((order) => order.items.map((item) => item.name)))], [orders]);
  const filtered = useMemo(() => orders.filter((order) => {
    const date = new Date(order.createdAt);
    const matchesMonth = !month || order.createdAt.slice(0, 7) === month;
    const matchesDay = !day || order.createdAt.slice(0, 10) === day;
    const matchesCategory = !category || order.items.some((item) => item.name === category);
    return date.toString() !== 'Invalid Date' && matchesMonth && matchesDay && matchesCategory;
  }), [orders, month, day, category]);

  const download = () => {
    const headers = ['التاريخ', 'الاسم', 'الهاتف', 'الموقع', 'المنطقة', 'حالة الطلب', 'تفاصيل المنتجات', 'مجموع المنتجات', 'كود الخصم', 'قيمة الخصم', 'رسوم التوصيل', 'الإجمالي'];
    const rows = filtered.map((order) => {
      const amounts = getOrderAmounts(order);
      return [
        formatOrderDate(order.createdAt),
        order.customer.name,
        englishDigits(order.customer.phone),
        order.customer.address,
        order.region,
        orderStatusOptions.find((status) => status.value === (order.status || 'new'))?.label || 'جديد',
        order.items.map((item) => `${item.name} - ${item.color} × ${englishDigits(item.quantity)} @ ${formatOrderMoney(item.price)} = ${formatOrderMoney(item.price * item.quantity)}`).join(' | '),
        formatOrderMoney(amounts.subtotal),
        order.promoCode || '-',
        formatOrderMoney(amounts.discount),
        formatOrderMoney(amounts.deliveryFee),
        formatOrderMoney(order.total),
      ];
    });
    const csv = '\uFEFF' + [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `moon-face-orders-${month || day || 'all'}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  const changeStatus = async (order: Order, status: OrderStatus) => {
    onError('');
    setSavingStatusIds((current) => new Set(current).add(order.id));
    try {
      await updateOrderStatusInApi(order.id, status);
      onOrdersChange(await loadOrdersFromApi() as Order[]);
    } catch {
      onError('تعذر حفظ حالة الطلب في قاعدة البيانات. لم يتم تأكيد التغيير.');
    } finally {
      setSavingStatusIds((current) => {
        const next = new Set(current);
        next.delete(order.id);
        return next;
      });
    }
  };

  const removeOrder = async (order: Order) => {
    if (!window.confirm(`هل تريد حذف طلب ${order.customer.name}؟`)) return;
    onError('');
    try {
      await deleteOrderFromApi(order.id);
      onOrdersChange((current) => current.filter((item) => item.id !== order.id));
    } catch {
      onError('تعذر حذف الطلب. حاول مرة أخرى.');
    }
  };

  const removeAllOrders = async () => {
    if (!orders.length || !window.confirm(`سيتم حذف جميع الطلبات (${formatOrderNumber(orders.length)}). هل تريد المتابعة؟`)) return;
    onError('');
    try {
      await deleteAllOrdersFromApi();
      onOrdersChange([]);
    } catch {
      onError('تعذر حذف الطلبات. حاول مرة أخرى.');
    }
  };

  return <div>
    <div className="grid grid-cols-2 gap-2 mb-3"><label className="text-xs text-charcoal-500">حسب الشهر<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="field mt-1" /></label><label className="text-xs text-charcoal-500">حسب اليوم<input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="field mt-1" /></label></div>
    <label className="text-xs text-charcoal-500">حسب الصنف<select value={category} onChange={(e) => setCategory(e.target.value)} className="field mt-1"><option value="">كل الأصناف</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-2 mt-4">
     <button onClick={download} disabled={!filtered.length} className="py-3 rounded-xl bg-moon-face-700 text-black font-bold flex gap-2 justify-center items-center text-xs sm:text-sm hover:bg-[#3B2A22] hover:text-white disabled:opacity-40">
  <Download size={17} /> تنزيل ملف Excel
</button>
      <button onClick={() => void removeAllOrders()} disabled={!orders.length} className="py-3 rounded-xl border border-red-200 bg-red-50 text-red-700 font-bold flex gap-2 justify-center items-center text-xs sm:text-sm hover:bg-red-100 disabled:opacity-40"><Trash2 size={17} /> حذف كل الطلبات</button>
    </div>
    {loading ? <p className="text-center py-10 text-charcoal-500">جاري تحميل الطلبات...</p> : !filtered.length ? <p className="text-center py-10 text-charcoal-500">لا توجد طلبات مطابقة</p> : <div className="space-y-3 mt-5">{filtered.map((order) => {
      const amounts = getOrderAmounts(order);
      const status = order.status || 'new';
      return <article key={order.id} className="bg-white rounded-2xl p-4 shadow-sm text-sm">
        <div className="flex items-start justify-between gap-3 font-bold"><span className="min-w-0">{order.customer.name}</span><span className="shrink-0">{formatOrderMoney(order.total)}</span></div>
        <p className="text-xs text-charcoal-500 mt-1">{formatOrderDate(order.createdAt)}</p>
        <p className="mt-2">{englishDigits(order.customer.phone)} · {order.region}</p>
        <p className="text-charcoal-500">{order.customer.address}</p>
        <div className="mt-3 space-y-2 border-t border-moon-face-100 pt-3">
          {order.items.map((item, index) => <div key={`${item.id}-${index}`} className="flex justify-between gap-3 text-xs">
            <span className="min-w-0">{item.name}{item.color ? ` · ${item.color}` : ''} × {englishDigits(item.quantity)} <span className="text-charcoal-500">({formatOrderMoney(item.price)} للقطعة)</span></span>
            <b className="shrink-0">{formatOrderMoney(item.price * item.quantity)}</b>
          </div>)}
        </div>
        <div className="mt-3 space-y-1 border-t border-moon-face-100 pt-3 text-xs">
          <div className="flex justify-between"><span>مجموع المنتجات</span><span>{formatOrderMoney(amounts.subtotal)}</span></div>
          {amounts.discount ? <div className="flex justify-between text-green-700"><span>الخصم{order.promoCode ? ` (${order.promoCode})` : ''}</span><span>-{formatOrderMoney(amounts.discount)}</span></div> : order.promoCode ? <div className="flex justify-between"><span>كود الخصم</span><span>{order.promoCode}</span></div> : null}
          <div className="flex justify-between"><span>رسوم التوصيل</span><span>{formatOrderMoney(amounts.deliveryFee)}</span></div>
          <div className="flex justify-between border-t border-moon-face-100 pt-2 font-bold"><span>الإجمالي</span><span>{formatOrderMoney(order.total)}</span></div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <label htmlFor={`order-status-${order.id}`} className="shrink-0 text-xs font-semibold">حالة الطلب</label>
          <select id={`order-status-${order.id}`} value={status} disabled={savingStatusIds.has(order.id)} onChange={(event) => void changeStatus(order, event.target.value as OrderStatus)} className="field min-w-0 flex-1 py-2 text-xs disabled:cursor-wait disabled:opacity-60">
            {orderStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {savingStatusIds.has(order.id) && <span className="shrink-0 text-[11px] text-charcoal-500">جارٍ الحفظ...</span>}
          <button type="button" onClick={() => void removeOrder(order)} aria-label={`حذف طلب ${order.customer.name}`} title="حذف الطلب" className="shrink-0 rounded-lg border border-red-200 p-2 text-red-700 hover:bg-red-50"><Trash2 size={17} /></button>
        </div>
        <button type="button" onClick={() => setPreviewOrder(order)} className="mt-3 flex w-full items-center justify-center gap-2 border border-moon-face-200 py-2.5 text-sm font-semibold text-moon-face-800 hover:bg-moon-face-50"><Eye size={16} />معاينة الطلب</button>
      </article>;
    })}</div>}
    {previewOrder && <OrderPreviewDialog order={previewOrder} products={products} onClose={() => setPreviewOrder(null)} />}
  </div>;
}