import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Bookmark, CircleUserRound, Eye, EyeOff, Heart, LogOut, X } from 'lucide-react';
import { FcGoogle } from 'react-icons/fc';
import { loadLoyaltyBalance, loadLoyaltyConfig, loadMyProductInteractions, loadUserOrders, lookupOrder as lookupOrderByNumber, type StoreOrder, type TrackedOrder } from '../lib/api';
import type { Product } from '../data/products';
import type { SiteContent } from '../data/siteContent';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n';
import AdminPanel from './AdminPanel';
import OrderPreviewDialog from './OrderPreviewDialog';

type Props = { open: boolean; products: Product[]; siteContent: SiteContent; onSaveProducts: (products: Product[]) => Promise<void>; onSaveSiteContent: (content: SiteContent) => Promise<void>; onClose: () => void };
type GuestOrderResult = TrackedOrder | null;

export default function AccountPanel({ open, products, siteContent, onSaveProducts, onSaveSiteContent, onClose }: Props) {
  const { language, t } = useLanguage();
  const { user, profile, isGuest, configured, signIn, signUp, requestPasswordReset, completePasswordReset, signInWithGoogle, signOut, continueAsGuest } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [authStep, setAuthStep] = useState<'auth' | 'requestReset' | 'completeReset'>('auth');
  const [showAuth, setShowAuth] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [pointValue, setPointValue] = useState(0.01);
  const [orderSearch, setOrderSearch] = useState('');
  const [interactions, setInteractions] = useState<{ likes: Set<number>; saves: Set<number>; comments: { product_id: number; body: string; created_at: string }[] }>({ likes: new Set(), saves: new Set(), comments: [] });
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingToken, setTrackingToken] = useState('');
  const [guestOrder, setGuestOrder] = useState<GuestOrderResult>(null);
  const [previewOrder, setPreviewOrder] = useState<TrackedOrder | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [loading, setLoading] = useState(false);

  const isAdmin = Boolean(profile?.is_store_owner);

  useEffect(() => {
    if (!open || !user?.id) return;
    let active = true;
    setLoading(true);
    Promise.all([loadUserOrders(), loadMyProductInteractions(), loadLoyaltyBalance(), loadLoyaltyConfig()]).then(([nextOrders, nextInteractions, nextBalance, loyaltyConfig]) => {
      if (!active) return;
      setOrders(nextOrders);
      setInteractions(nextInteractions);
      setLoyaltyBalance(nextBalance);
      setPointValue(Number(loyaltyConfig.currencyValuePerPoint) || 0.01);
    }).catch((cause) => {
      if (active) setError(language === 'en' ? t('accountLoadError') : cause instanceof Error ? cause.message : t('accountLoadError'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, user?.id]);

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      if (mode === 'signUp') {
        if (password !== confirmPassword) throw new Error(t('passwordMismatch'));
        const hasSession = await signUp(email.trim(), password, name);
        setNotice(hasSession ? t('accountCreated') : t('confirmEmail'));
        setPassword('');
        setConfirmPassword('');
      } else {
        await signIn(email.trim(), password);
        setPassword('');
      }
    } catch (cause) {
      setError(language === 'en' ? t('authError') : cause instanceof Error ? cause.message : t('authError'));
    }
  };

  const sendPasswordResetCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setAuthBusy(true);
    try {
      await requestPasswordReset(email.trim());
      setAuthStep('completeReset');
      setNotice(t('resetCodeSent'));
    } catch (cause) {
      setError(language === 'en' ? t('authError') : cause instanceof Error ? cause.message : t('authError'));
    } finally {
      setAuthBusy(false);
    }
  };

  const submitPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (password !== confirmPassword) {
      setError(t('passwordMismatch'));
      return;
    }
    setAuthBusy(true);
    try {
      await completePasswordReset(email.trim(), resetCode, password);
      setAuthStep('auth');
      setMode('signIn');
      setPassword('');
      setConfirmPassword('');
      setResetCode('');
      setNotice(t('passwordUpdated'));
    } catch (cause) {
      setError(language === 'en' ? t('authError') : cause instanceof Error ? cause.message : t('authError'));
    } finally {
      setAuthBusy(false);
    }
  };

  const lookupOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLookupError('');
    setGuestOrder(null);
    try {
      const result = await lookupOrderByNumber(Number(trackingNumber), trackingToken);
      if (!result) throw new Error(t('orderNotFound'));
      setGuestOrder(result);
    } catch (cause) {
      setLookupError(language === 'en' ? t('orderLookupError') : cause instanceof Error ? cause.message : t('orderLookupError'));
    }
  };

  const productName = (productId: number) => {
    const product = products.find((item) => item.id === productId);
    return product ? language === 'ar' ? product.nameAr || product.name : product.name : `${t('productLabel')} #${productId}`;
  };

  const statusLabel = (status: string) => ({ new: t('statusNew'), cancelled: t('statusCancelled'), postponed: t('statusPostponed'), delivered: t('statusDelivered'), exchanged: t('statusExchanged') }[status] || status);

  return <AnimatePresence>{open && <>
    <motion.button type="button" aria-label={t('closeAccount')} onClick={onClose} className="fixed inset-0 z-[80] bg-[#172018]/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
    <motion.aside role="dialog" aria-modal="true" aria-label={t('customerAccount')} dir={language === 'en' ? 'ltr' : 'rtl'} className={`fixed inset-y-0 z-[81] flex w-full max-w-lg flex-col overflow-y-auto bg-[#f5f4ed] text-[#504A35] shadow-2xl ${language === 'en' ? 'left-0' : 'right-0'}`} initial={{ x: language === 'en' ? '-100%' : '100%' }} animate={{ x: 0 }} exit={{ x: language === 'en' ? '-100%' : '100%' }} transition={{ type: 'spring', damping: 28 }}>
      <header className="flex items-center justify-between border-b border-[#d3d4bf] px-5 py-4 sm:px-7">
        <div className="flex items-center gap-3"><CircleUserRound size={21} /><div><h2 className="font-bold">{user ? profile?.display_name || t('myAccount') : isGuest ? t('guestAccount') : t('customerAccount')}</h2><p className="text-xs text-[#77806c]">{user?.email || (isGuest ? t('guestBrowse') : t('signInOrCreate'))}</p></div></div>
        <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full hover:bg-[#e8e7da]" aria-label={t('close')}><X size={19} /></button>
      </header>

      {!user && (!isGuest || showAuth) ? <div className="space-y-5 p-5 sm:p-7">
        {!configured && <p className="border-r-2 border-amber-600 bg-amber-50 p-3 text-sm text-amber-900">{t('authUnavailable')}</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="text-sm text-green-800">{notice}</p>}
        {authStep === 'requestReset' ? <>
          <form onSubmit={sendPasswordResetCode} className="space-y-3">
            <p className="text-sm text-[#77806c]">{t('resetCodeInstructions')}</p>
            <input required type="email" autoComplete="email" className="field" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t('email')} />
            <button type="submit" disabled={!configured || authBusy} className="w-full bg-[#563C2E] px-4 py-3 font-semibold text-white disabled:opacity-40">{authBusy ? t('loading') : t('sendResetCode')}</button>
          </form>
          <button type="button" onClick={() => { setAuthStep('auth'); setError(''); setNotice(''); }} className="w-full py-2 text-sm text-[#5e6d49] underline underline-offset-4">{t('backToLogin')}</button>
        </> : authStep === 'completeReset' ? <form onSubmit={submitPasswordReset} className="space-y-3">
          <label className="block text-sm">{t('resetCode')}<input required inputMode="numeric" autoComplete="one-time-code" className="field mt-1" value={resetCode} onChange={(event) => setResetCode(event.target.value)} /></label>
          <div className="relative"><input required type={showPassword ? 'text' : 'password'} minLength={12} autoComplete="new-password" className={`field ${language === 'en' ? 'ps-12' : 'pe-12'}`} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('passwordHint')} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#66705b]" aria-label={showPassword ? t('hidePassword') : t('showPassword')} title={showPassword ? t('hidePassword') : t('showPassword')}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          <div className="relative"><input required type={showConfirmPassword ? 'text' : 'password'} minLength={12} autoComplete="new-password" className={`field ${language === 'en' ? 'ps-12' : 'pe-12'}`} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder={t('confirmPassword')} /><button type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#66705b]" aria-label={showConfirmPassword ? t('hidePassword') : t('showPassword')} title={showConfirmPassword ? t('hidePassword') : t('showPassword')}>{showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          <button type="submit" disabled={!configured || authBusy} className="w-full bg-[#563C2E] px-4 py-3 font-semibold text-white disabled:opacity-40">{authBusy ? t('loading') : t('updatePassword')}</button>
          <button type="button" onClick={() => { setAuthStep('requestReset'); setError(''); setNotice(''); }} className="w-full py-2 text-sm text-[#5e6d49] underline underline-offset-4">{t('resendResetCode')}</button>
        </form> : <>
          <div className="grid grid-cols-2 border-b border-[#d3d4bf]">
            <button type="button" onClick={() => { setMode('signIn'); setError(''); }} className={`border-b-2 py-3 text-sm ${mode === 'signIn' ? 'border-[#716B4E] font-bold' : 'border-transparent text-[#77806c]'}`}>{t('login')}</button>
            <button type="button" onClick={() => { setMode('signUp'); setError(''); }} className={`border-b-2 py-3 text-sm ${mode === 'signUp' ? 'border-[#716B4E] font-bold' : 'border-transparent text-[#77806c]'}`}>{t('signUp')}</button>
          </div>
          <form onSubmit={submitAuth} className="space-y-3">
            {mode === 'signUp' && <input required autoComplete="name" className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder={t('name')} />}
            <input required type="email" autoComplete="email" className="field" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t('email')} />
            <div className="relative"><input required type={showPassword ? 'text' : 'password'} minLength={mode === 'signUp' ? 12 : 1} autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'} className={`field ${language === 'en' ? 'ps-12' : 'pe-12'}`} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('passwordHint')} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#66705b]" aria-label={showPassword ? t('hidePassword') : t('showPassword')} title={showPassword ? t('hidePassword') : t('showPassword')}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            {mode === 'signUp' && <div className="relative"><input required type={showConfirmPassword ? 'text' : 'password'} minLength={12} autoComplete="new-password" className={`field ${language === 'en' ? 'ps-12' : 'pe-12'}`} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder={t('confirmPassword')} /><button type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#66705b]" aria-label={showConfirmPassword ? t('hidePassword') : t('showPassword')} title={showConfirmPassword ? t('hidePassword') : t('showPassword')}>{showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>}
            <button type="submit" disabled={!configured} className="flex w-full items-center justify-center gap-2 bg-[#563C2E] px-4 py-3 font-semibold text-white disabled:opacity-40">{mode === 'signUp' ? t('createAccount') : t('login')} {language === 'en' ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}</button>
          </form>
          {mode === 'signIn' && <button type="button" onClick={() => { setAuthStep('requestReset'); setError(''); setNotice(''); }} className="w-full text-sm text-[#5e6d49] underline underline-offset-4">{t('forgotPassword')}</button>}
          <button type="button" onClick={() => void signInWithGoogle().catch(() => setError(t('authError')))} disabled={!configured} className="inline-flex w-full items-center justify-center gap-2 border border-[#bbc1a8] bg-white px-4 py-3 text-sm font-semibold disabled:opacity-40"><FcGoogle aria-hidden="true" size={19} />{t('continueGoogle')}</button>
          <button type="button" onClick={() => { continueAsGuest(); setError(''); }} className="w-full py-2 text-sm text-[#5e6d49] underline underline-offset-4">{t('continueGuest')}</button>
        </>}
      </div> : <div className="space-y-7 p-5 sm:p-7">
        {user ? <>
          {isAdmin ? (
            <div className="space-y-4">
              <section className="rounded-2xl bg-[#563C2E] p-4 text-white">
                <p className="text-xs text-[#dfe3d7]">نوع الحساب</p>
                <h3 className="mt-2 text-2xl font-bold">مدير المتجر</h3>
              </section>

              <AdminPanel
                products={products}
                onSave={onSaveProducts}
                siteContent={siteContent}
                onSaveSiteContent={onSaveSiteContent}
                embedded
              />

              <button type="button" onClick={() => void signOut().then(onClose)} className="flex items-center gap-2 text-sm text-red-800"><LogOut size={16} /> {t('signOut')}</button>
            </div>
          ) : (
            <>
              <section className="flex items-center justify-between border-y border-[#d3d4bf] py-4">
                <div><h3 className="font-bold">{t('loyaltyPoints')}</h3><p className="mt-1 text-xs text-[#77806c]">{t('loyaltyEarnHint')}</p></div>
                <strong className="text-2xl tabular-nums">{new Intl.NumberFormat(language === 'en' ? 'en-US' : 'ar-u-nu-latn').format(loyaltyBalance)}</strong>
              </section>
              <div className="rounded-2xl border border-[#d3d4bf] bg-white p-3">
                <p className="text-xs text-[#77806c]">قيمة النقاط</p>
                <p className="mt-1 text-lg font-bold text-[#563C2E]">≈ {new Intl.NumberFormat(language === 'en' ? 'en-US' : 'ar-u-nu-latn').format(loyaltyBalance * pointValue)} شيكل</p>
                {loyaltyBalance > 0 && (
                  <button type="button" onClick={() => setNotice(`قيمة نقاطك الحالية هي ${(loyaltyBalance * pointValue).toFixed(2)} شيكل، ويمكن استخدامها عند الدفع.`)} className="mt-3 w-full rounded-xl bg-[#563C2E] px-3 py-2 text-sm font-semibold text-white">
                    استبدال النقاط
                  </button>
                )}
                {notice && <p className="mt-3 text-xs text-[#563C2E]">{notice}</p>}
              </div>
              <section><div className="mb-3 flex items-center justify-between"><h3 className="font-bold">{t('myOrders')}</h3><span className="text-xs text-[#77806c]">{orders.length} {t('orderCount')}</span></div>
                <input type="search" inputMode="numeric" aria-label={t('searchOrder')} className="field mb-3" value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder={t('searchOrder')} />
                {loading ? <p className="py-6 text-center text-sm text-[#77806c]">{t('loading')}</p> : orders.filter((order) => !orderSearch.trim() || String(order.id).includes(orderSearch.trim())).length ? <div className="divide-y divide-[#d3d4bf]">{orders.filter((order) => !orderSearch.trim() || String(order.id).includes(orderSearch.trim())).map((order) => <div key={order.id} className="flex items-start justify-between gap-4 py-4"><div><p className="font-bold">{t('orderNumber')} #{order.id}</p><p className="mt-1 text-xs text-[#77806c]">{new Date(order.createdAt).toLocaleDateString(language === 'en' ? 'en-US' : 'ar-u-nu-latn')}</p></div><div className="text-left"><span className="inline-block bg-[#e8e7da] px-2 py-1 text-xs">{statusLabel(order.status)}</span><p className="mt-2 text-sm font-bold">₪{order.total}</p></div></div>)}</div> : <p className="py-6 text-center text-sm text-[#77806c]">{orders.length ? t('noMatchingOrder') : t('noOrdersYet')}</p>}
              </section>
              <section><h3 className="mb-3 font-bold">{t('myInteractions')}</h3><div className="space-y-3 border-y border-[#d3d4bf] py-4"><div className="flex items-center gap-2 text-sm"><Heart size={16} className="text-red-700" /> {t('likesLabel')} ({interactions.likes.size})</div><div className="flex flex-wrap gap-2">{[...interactions.likes].map((id) => <span key={id} className="bg-white px-2 py-1 text-xs">{productName(id)}</span>)}</div><div className="flex items-center gap-2 pt-2 text-sm"><Bookmark size={16} /> {t('savesLabel')} ({interactions.saves.size})</div><div className="flex flex-wrap gap-2">{[...interactions.saves].map((id) => <span key={id} className="bg-white px-2 py-1 text-xs">{productName(id)}</span>)}</div>{interactions.comments.map((comment, index) => <p key={`${comment.product_id}-${index}`} className="border-t border-[#d3d4bf] pt-2 text-xs">{productName(comment.product_id)}: {comment.body}</p>)}</div></section>
              <button type="button" onClick={() => void signOut().then(onClose)} className="flex items-center gap-2 text-sm text-red-800"><LogOut size={16} /> {t('signOut')}</button>
            </>
          )}
        </> : <>
          <section><h3 className="mb-4 font-bold">{t('trackingOrder')}</h3><form onSubmit={lookupOrder} className="space-y-3"><input required type="number" min="1" inputMode="numeric" className="field" value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} placeholder={t('orderNumber')} /><input required type="text" dir="ltr" maxLength={64} pattern="[a-fA-F0-9]{64}" autoComplete="off" spellCheck={false} className="field font-mono" value={trackingToken} onChange={(event) => setTrackingToken(event.target.value)} placeholder={t('orderTrackingCode')} /><button className="w-full bg-[#563C2E] px-4 py-3 font-semibold text-white">{t('findOrder')}</button></form>{lookupError && <p role="alert" className="mt-3 text-sm text-red-700">{lookupError}</p>}{guestOrder && <div className="mt-4 border-y border-[#d3d4bf] py-4"><b>{t('orderNumber')} #{guestOrder.id}</b><p className="mt-1 text-sm">{t('orderStatus')}: {statusLabel(guestOrder.status)}</p><p className="mt-1 text-xs">{t('orderDate')}: {new Date(guestOrder.createdAt).toLocaleDateString(language === 'en' ? 'en-US' : 'ar-u-nu-latn')}</p><p className="mt-1 text-sm font-semibold">₪{guestOrder.total}</p><button type="button" onClick={() => setPreviewOrder(guestOrder)} className="mt-3 flex w-full items-center justify-center gap-2 border border-[#bbc1a8] bg-white py-2.5 text-sm font-semibold"><Eye size={16} />{t('orderPreview')}</button></div>}</section>
          <button type="button" onClick={() => setShowAuth(true)} className="w-full border border-[#bbc1a8] py-3 text-sm">{t('signInOrCreate')}</button>
        </>}
      </div>}
      {previewOrder && <OrderPreviewDialog order={previewOrder} products={products} onClose={() => setPreviewOrder(null)} />}
    </motion.aside>
  </>}</AnimatePresence>;
}
