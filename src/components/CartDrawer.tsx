import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Check, CreditCard, LoaderCircle, MessageCircle, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import AnimatedActionButton from './AnimatedActionButton';
import StoredMedia from './StoredMedia';
import type { Product } from '../data/products';
import { loadCartReminderStatus, loadLoyaltyBalance, loadLoyaltyConfig, saveOrder, sendOrderToShipping, subscribeToCartReminders, validateWheelCoupon, type LoyaltyConfig } from '../lib/api';
import { translateProductColor, useLanguage } from '../i18n';
import { useAuth } from '../context/AuthContext';

export type CartItem = Product & { quantity: number; selectedColor: string; lineId: string };
const delivery = { الضفة: 20, القدس: 30, الداخل: 70 };
const normalizeCouponCode = (code: string) => code.replace(/\s+/g, '').toUpperCase();

export default function CartDrawer({ open, items, sessionId, whatsappNumber, onClose, onChange, onClear }: { open: boolean; items: CartItem[]; sessionId: string; whatsappNumber: string; onClose: () => void; onChange: (lineId: string, delta: number) => void; onClear: () => void }) {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const [region, setRegion] = useState<'الضفة' | 'القدس' | 'الداخل'>('الضفة');
  const [paymentMethod, setPaymentMethod] = useState<'CASH_ON_DELIVERY' | 'CARD'>('CASH_ON_DELIVERY');
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '' });
  const [orderNotice, setOrderNotice] = useState<{ number: string; token: string } | null>(null);
  const [whatsappHref, setWhatsappHref] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponDiscountPercent, setCouponDiscountPercent] = useState(0);
  const [couponMessage, setCouponMessage] = useState('');
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [loyaltyConfig, setLoyaltyConfig] = useState<LoyaltyConfig>({ pointsPerCurrency: 1, currencyValuePerPoint: 0.01, campaigns: [] });
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [pushNotice, setPushNotice] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushStatusLoaded, setPushStatusLoaded] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const localStatus = localStorage.getItem(`moon-face-cart-reminders:${sessionId}`) === 'true';
        setPushEnabled(localStatus);
      } catch { /* حماية إضافية */ }
    }
  }, [sessionId]);

  useEffect(() => {
    let active = true;
    setPushStatusLoaded(false);
    void loadCartReminderStatus(sessionId).then((enabled) => {
      if (!active) return;
      setPushEnabled(enabled);
      try {
        if (enabled) localStorage.setItem(`moon-face-cart-reminders:${sessionId}`, 'true');
        else localStorage.removeItem(`moon-face-cart-reminders:${sessionId}`);
      } catch { /* السيرفر هو مصدر الحقيقة الافتراضي */ }
    }).catch(() => undefined).finally(() => {
      if (active) setPushStatusLoaded(true);
    });
    return () => { active = false; };
  }, [sessionId]);

  useEffect(() => {
    let active = true;
    void loadLoyaltyConfig().then((config) => { if (active) setLoyaltyConfig(config); }).catch(() => undefined);
    if (user) void loadLoyaltyBalance().then((balance) => { if (active) setLoyaltyBalance(balance); }).catch(() => undefined);
    else setLoyaltyBalance(0);
    return () => { active = false; };
  }, [user]);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = couponApplied ? Math.round(subtotal * couponDiscountPercent) / 100 : 0;
  const pointValue = Math.max(0.0001, loyaltyConfig.currencyValuePerPoint);
  const maxRedeemablePoints = user ? Math.min(loyaltyBalance, Math.floor(Math.max(0, subtotal - discount) / pointValue)) : 0;
  const redeemedPoints = Math.min(maxRedeemablePoints, Math.max(0, Math.floor(pointsToRedeem)));
  const loyaltyDiscount = redeemedPoints * pointValue;
  const total = subtotal - discount - loyaltyDiscount + delivery[region];

  const applyCoupon = async () => {
    try {
      const code = normalizeCouponCode(couponInput);
      const discountPercent = code === 'MOON-FACE.10' ? 10 : await validateWheelCoupon(code);
      if (discountPercent > 0) {
        setCouponDiscountPercent(discountPercent);
        setCouponApplied(true);
        setCouponMessage(t('couponSuccess'));
        return;
      }
      setCouponDiscountPercent(0);
      setCouponApplied(false);
      setCouponMessage(t('couponInvalid'));
    } catch {
      setCouponDiscountPercent(0);
      setCouponApplied(false);
      setCouponMessage(t('couponInvalid'));
    }
  };

  const confirmOrder = async () => {
    if (paymentMethod !== 'CASH_ON_DELIVERY') return false;
    if (!customer.name || !customer.phone || !customer.address || !items.length) return false;
    const whatsappDigits = whatsappNumber.replace(/\D/g, '');
    const whatsappWindow = whatsappDigits ? window.open('about:blank', '_blank') : null;
    setWhatsappHref('');
    const order = {
      customer,
      region,
      items: items.map((item) => ({ id: item.id, name: item.name, color: item.selectedColor, price: item.price, quantity: item.quantity })),
      subtotal,
      discount,
      loyaltyPointsRedeemed: redeemedPoints,
      loyaltyDiscount,
      promoCode: couponApplied ? normalizeCouponCode(couponInput) : '',
      deliveryFee: delivery[region],
      total,
    };
    try {
      const result = await saveOrder(order);
      if (whatsappDigits) {
        const message = [
          'طلب جديد من متجر Moon Face',
          `رقم الطلب: ${result.orderNumber}`,
          `الاسم: ${order.customer.name}`,
          `الهاتف: ${order.customer.phone}`,
          `العنوان: ${order.customer.address}`,
          `المنطقة: ${order.region}`,
          'المنتجات:',
          ...order.items.map((item) => `- ${item.name} (${item.color}) × ${item.quantity} = ₪${item.price * item.quantity}`),
          `المجموع: ₪${order.total}`,
        ].join('\n');
        const whatsappUrl = new URL(`https://wa.me/${whatsappDigits}`);
        whatsappUrl.searchParams.set('text', message);
        setWhatsappHref(whatsappUrl.href);
        if (whatsappWindow) whatsappWindow.location.href = whatsappUrl.href;
      }
      void sendOrderToShipping(order, result.orderNumber).catch((error) => {
        console.warn('Shipping request failed; the order was saved successfully.', error);
      });
      return `${result.orderNumber}:${result.trackingToken}`;
    } catch (error) {
      whatsappWindow?.close();
      console.error('Order submission failed:', error);
      return false;
    }
  };

  const enableCartReminders = async () => {
    if (pushBusy || pushEnabled) return;
    setPushBusy(true);
    setPushNotice('');
    try {
      await subscribeToCartReminders(sessionId);
      setPushEnabled(true);
      try { localStorage.setItem(`moon-face-cart-reminders:${sessionId}`, 'true'); } catch { /* The backend retains the subscription. */ }
      setPushNotice(t('notificationEnabled'));
    } catch (cause) {
      setPushNotice(cause instanceof Error ? cause.message : t('notificationSetupError'));
    } finally {
      setPushBusy(false);
    }
  };

  return <AnimatePresence>{open && <>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-black/40 z-[60]" />
    <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 26 }} dir={language === 'en' ? 'ltr' : 'rtl'} className="fixed top-0 right-0 h-full w-full max-w-md bg-[#f6f3e8] z-[61] shadow-2xl p-5 sm:p-7 overflow-y-auto">
      <div className="flex items-center justify-between mb-6"><h2 className="text-2xl font-bold">{t('cart')}</h2><button onClick={onClose} className="p-2 rounded-full hover:bg-moon-face-100" aria-label={t('close')}><X /></button></div>
      {orderNotice && <div role="status" className="mb-5 border-r-4 border-[#5e6d49] bg-[#e8e7da] p-4"><p className="font-bold">{t('orderConfirmed')} #{orderNotice.number}</p><p className="mt-2 text-sm">{t('orderTrackingCode')}</p><code dir="ltr" className="mt-1 block select-all break-all rounded bg-white px-2 py-1 text-xs">{orderNotice.token}</code><p className="mt-2 text-sm">{t('orderTrackingHint')}</p>{whatsappHref && <a href={whatsappHref} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded border border-[#5e6d49] px-3 py-2 text-sm font-semibold text-[#3d4b30]"><MessageCircle size={16} />{t('openWhatsApp')}</a>}</div>}
      {!items.length ? <p className="text-center py-16 text-charcoal-500">{t('emptyCart')}</p> : <>
        <div className="space-y-4">{items.map((item) => <div key={item.lineId} className="flex gap-3 items-center bg-white rounded-xl p-3 shadow-sm">
          <StoredMedia type="image" source={item.image} alt={language === 'ar' ? item.nameAr : item.name} className="w-16 h-20 shrink-0 object-cover rounded-lg" />
          <div className="min-w-0 flex-1"><b className="block truncate">{language === 'ar' ? item.nameAr : item.name}</b><p className="text-xs text-charcoal-500">{t('color')}: {translateProductColor(item.selectedColor, language)}</p><p className="text-sm font-semibold text-charcoal-700">₪{item.price}</p>
            <div className="flex items-center gap-2 mt-2"><button aria-label={t('decreaseQuantity')} onClick={() => onChange(item.lineId, -1)} className="p-1 rounded-full bg-moon-face-100"><Minus size={14} /></button><span>{item.quantity}</span><button aria-label={t('increaseQuantity')} onClick={() => onChange(item.lineId, 1)} className="p-1 rounded-full bg-moon-face-100"><Plus size={14} /></button></div>
          </div>
          <button aria-label={t('removeItem')} onClick={() => onChange(item.lineId, -item.quantity)} className="shrink-0 text-red-400"><Trash2 size={17} /></button>
        </div>)}</div>
        <div className="mt-4 border-y border-moon-face-200 py-3"><motion.button type="button" onClick={() => void enableCartReminders()} disabled={pushBusy || pushEnabled || !pushStatusLoaded} aria-live="polite" whileTap={!pushBusy && !pushEnabled && pushStatusLoaded ? { scale: 0.98 } : undefined} className={`flex w-full items-center justify-center gap-2 py-2 text-sm font-semibold transition-colors disabled:cursor-default ${pushEnabled ? 'text-emerald-700' : 'text-[#563C2E]'}`}><AnimatePresence mode="wait" initial={false}>{pushBusy || !pushStatusLoaded ? <motion.span key="busy" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="inline-flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" />{t('loading')}</motion.span> : pushEnabled ? <motion.span key="enabled" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 22 }} className="inline-flex items-center gap-2"><Check size={17} strokeWidth={3} />{t('notificationEnabled')}</motion.span> : <motion.span key="idle" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="inline-flex items-center gap-2"><Bell size={16} />{t('cartReminderOptIn')}</motion.span>}</AnimatePresence></motion.button>{pushNotice && !pushEnabled && <p role="status" className="text-center text-xs text-red-700">{pushNotice}</p>}</div>
        <div className="mt-8"><p className="text-xs font-light text-charcoal-500 mb-3">{t('delivery')}</p><div className="grid grid-cols-3 gap-2">{Object.entries(delivery).map(([name, price]) => <button key={name} onClick={() => setRegion(name as keyof typeof delivery)} className={`rounded-lg border py-3 text-sm transition-all ${region === name ? 'border-moon-face-600 bg-moon-face-100 shadow-md' : 'border-charcoal-200 bg-white'}`}><span className="block">{({ الضفة: t('westBank'), القدس: t('jerusalem'), الداخل: t('inside') }[name as keyof typeof delivery])}</span><b>₪{price}</b></button>)}</div>
          <div className="space-y-3 mt-5"><input value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} placeholder={t('name')} className="field" /><input value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} placeholder={t('phone')} type="tel" className="field" /><textarea value={customer.address} onChange={(event) => setCustomer({ ...customer, address: event.target.value })} placeholder={t('address')} className="field min-h-20 resize-none" /></div>
            <fieldset className="mt-5 space-y-2">
              <legend className="mb-2 text-sm font-bold">{language === 'en' ? 'Payment method' : 'طريقة الدفع'}</legend>
              <label className={`flex cursor-pointer items-center gap-3 rounded-lg border bg-white p-3 ${paymentMethod === 'CASH_ON_DELIVERY' ? 'border-moon-face-600 ring-1 ring-moon-face-600' : 'border-charcoal-200'}`}>
                <input type="radio" name="payment-method" value="CASH_ON_DELIVERY" checked={paymentMethod === 'CASH_ON_DELIVERY'} onChange={() => setPaymentMethod('CASH_ON_DELIVERY')} />
                <span className="text-sm font-semibold">{language === 'en' ? 'Cash on delivery' : 'الدفع عند الاستلام'}</span>
              </label>
              <label className={`flex cursor-pointer items-center gap-3 rounded-lg border bg-white p-3 ${paymentMethod === 'CARD' ? 'border-moon-face-600 ring-1 ring-moon-face-600' : 'border-charcoal-200'}`}>
                <input type="radio" name="payment-method" value="CARD" checked={paymentMethod === 'CARD'} onChange={() => setPaymentMethod('CARD')} />
                <CreditCard size={18} aria-hidden="true" />
                <span className="text-sm font-semibold">{language === 'en' ? 'Credit / debit card' : 'الدفع عبر البطاقة'}</span>
              </label>
              <AnimatePresence initial={false}>
                {paymentMethod === 'CARD' && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                    {language === 'en'
                      ? 'Card payments are not enabled yet. No card details are collected here. Please choose cash on delivery.'
                      : 'الدفع بالبطاقة غير متاح حاليًا. لا تُدخل بيانات البطاقة هنا. يرجى اختيار الدفع عند الاستلام.'}
                    <p className="mt-2 text-xs">
                      {language === 'en'
                        ? 'When enabled, the bank-hosted fields will charge the products amount in ILS only; delivery is paid in cash on receipt.'
                        : 'عند تفعيل الخدمة، ستُخصم قيمة المنتجات فقط (بالشيكل) عبر البطاقة، وتُدفع رسوم التوصيل نقدًا عند الاستلام.'}
                    </p>
                  </div>
                </motion.div>}
              </AnimatePresence>
            </fieldset>
          {user && maxRedeemablePoints > 0 && <label className="mt-4 block text-sm">{t('redeemPoints')} · {loyaltyBalance}<input className="field mt-1" type="number" min="0" max={maxRedeemablePoints} step="1" value={pointsToRedeem || ''} onChange={(event) => setPointsToRedeem(Number(event.target.value) || 0)} /><span className="mt-1 block text-xs text-charcoal-500">{t('pointsWorth')}: ₪{loyaltyDiscount.toFixed(2)}</span></label>}
          <div className="mt-5 flex gap-2"><input value={couponInput} onChange={(event) => { setCouponInput(event.target.value); setCouponApplied(false); setCouponDiscountPercent(0); setCouponMessage(''); }} placeholder={t('couponPlaceholder')} className="field min-w-0" /><button type="button" onClick={() => void applyCoupon()} className="shrink-0 rounded-lg border border-moon-face-600 px-4 text-sm font-bold text-moon-face-800 hover:bg-moon-face-100">{t('applyCoupon')}</button></div>
          {couponMessage && <p className={`mt-2 text-sm ${couponApplied ? 'text-green-700' : 'text-red-600'}`} role="status">{couponMessage}</p>}
          <div className="mt-5 space-y-2 border-t pt-4 text-sm"><div className="flex justify-between"><span>{t('subtotal')}</span><span>₪{subtotal}</span></div>{couponApplied && <div className="flex justify-between text-green-700"><span>{t('couponDiscount')}</span><span>-₪{discount}</span></div>}{redeemedPoints > 0 && <div className="flex justify-between text-green-700"><span>{t('redeemPoints')} ({redeemedPoints})</span><span>-₪{loyaltyDiscount.toFixed(2)}</span></div>}<div className="flex justify-between text-charcoal-500"><span>{t('deliveryFee')}</span><span>₪{delivery[region]}</span></div><div className="flex justify-between border-t pt-3 text-lg font-bold"><span>{t('total')}</span><span>₪{total.toFixed(2)}</span></div></div>
          <AnimatedActionButton disabled={paymentMethod !== 'CASH_ON_DELIVERY' || !customer.name || !customer.phone || !customer.address} onAction={confirmOrder} onSuccess={(result) => { if (typeof result === 'string') { const [number, token] = result.split(':'); if (number && token) setOrderNotice({ number, token }); } setPointsToRedeem(0); onClear(); }} icon={<ShoppingBag size={18} />} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#3B2A22] py-4 font-bold text-white transition-all hover:bg-moon-face-800 disabled:opacity-40">{t('confirm')}</AnimatedActionButton>
        </div>
      </>}
    </motion.aside>
  </>}</AnimatePresence>;
}