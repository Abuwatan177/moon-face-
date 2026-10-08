import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bookmark, Heart, MessageCircle, Send, Star, Trash2, X } from 'lucide-react';
import { addProductComment, addProductReview, deleteProductComment, invalidateProductMetrics, loadMyProductInteractions, loadProductComments, loadProductMetrics, toggleProductInteraction, type ProductComment } from '../lib/api';
import type { Product } from '../data/products';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n';
import { playStoreSound } from '../utils/storeSounds';

export default function ProductEngagement({ product, onRequireAuth, showProductExtras = true, subjectLabel }: { product: Product; onRequireAuth: () => void; showProductExtras?: boolean; subjectLabel?: string }) {
  const { language, t } = useLanguage();
  const { user, profile, configured } = useAuth();
  const commentCacheScope = user?.id || 'anonymous';
  const previousMetricsUserId = useRef(user?.id);
  const [metrics, setMetrics] = useState({ likes: 0, saves: 0, comments: 0, rating: 0, ratingCount: 0 });
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [feedbackPanel, setFeedbackPanel] = useState<'comments' | 'review' | null>(null);
  const [comments, setComments] = useState<ProductComment[]>([]);
  const [draft, setDraft] = useState('');
  const [reviewName, setReviewName] = useState('');
  const [reviewDraft, setReviewDraft] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewMessage, setReviewMessage] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshReviews = async () => {
    const [nextReviews, nextMetrics] = await Promise.all([loadProductComments(product.id, commentCacheScope), loadProductMetrics([product.id])]);
    setComments(nextReviews);
    setMetrics((current) => ({ ...current, ...(nextMetrics.get(product.id) || {}) }));
  };

  useEffect(() => {
    if (!feedbackPanel) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setFeedbackPanel(null); };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [feedbackPanel]);

  useEffect(() => {
    let active = true;
    if (previousMetricsUserId.current !== user?.id) {
      invalidateProductMetrics(product.id);
      previousMetricsUserId.current = user?.id;
    }
    void loadProductMetrics([product.id]).then((result) => {
      if (active) setMetrics((current) => ({ ...current, ...(result.get(product.id) || {}) }));
    }).catch(() => undefined);
    if (user) void loadMyProductInteractions([product.id], user.id).then((result) => {
      if (!active) return;
      setLiked(result.likes.has(product.id));
      setSaved(result.saves.has(product.id));
    }).catch(() => undefined);
    else { setLiked(false); setSaved(false); }
    return () => { active = false; };
  }, [product.id, user?.id]);

  const toggle = async (kind: 'like' | 'save') => {
    if (!user) { onRequireAuth(); return; }
    setBusy(true);
    setMessage('');
    try {
      const active = await toggleProductInteraction(product.id, kind, user.id);
      invalidateProductMetrics(product.id);
      if (kind === 'like') setLiked(active);
      else setSaved(active);
      if (kind === 'like' && active) playStoreSound('like');
      setMetrics((current) => ({ ...current, [kind === 'like' ? 'likes' : 'saves']: current[kind === 'like' ? 'likes' : 'saves'] + (active ? 1 : -1) }));
    } catch (error) {
      setMessage(language === 'en' ? t('authError') : error instanceof Error ? error.message : t('authError'));
    } finally {
      setBusy(false);
    }
  };

  const openComments = async () => {
    setFeedbackPanel('comments');
    if (!comments.length) {
      try {
        const nextComments = await loadProductComments(product.id, commentCacheScope);
        setComments(nextComments);
        setMetrics((current) => ({ ...current, comments: Math.max(current.comments, nextComments.length) }));
      } catch { setMessage(t('authError')); }
    }
  };

  const submitComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user && configured) { onRequireAuth(); return; }
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setMessage('');
    try {
      await addProductComment(product.id, profile?.display_name || user?.email || t('guestName'), body);
      invalidateProductMetrics(product.id);
      setDraft('');
      setComments(await loadProductComments(product.id, commentCacheScope));
      setMetrics((current) => ({ ...current, comments: current.comments + 1 }));
    } catch (error) {
      setMessage(language === 'en' ? t('authError') : error instanceof Error ? error.message : t('authError'));
    } finally {
      setBusy(false);
    }
  };

  const submitReview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = reviewDraft.trim();
    if (!body) return;
    setBusy(true);
    setReviewMessage('');
    try {
      await addProductReview(product.id, reviewName || profile?.display_name || '', reviewRating, body);
      invalidateProductMetrics(product.id);
      setReviewDraft('');
      setReviewName('');
      await refreshReviews();
      setReviewMessage(t('reviewThanks'));
    } catch (error) {
      setReviewMessage(language === 'en' ? t('authError') : error instanceof Error ? error.message : t('authError'));
    } finally {
      setBusy(false);
    }
  };

  const removeComment = async (comment: ProductComment) => {
    if (busy || !window.confirm(t('confirmDeleteComment'))) return;
    setBusy(true);
    setMessage('');
    try {
      await deleteProductComment(comment.id);
      invalidateProductMetrics(product.id);
      setComments((current) => current.filter((item) => item.id !== comment.id));
      setMetrics((current) => ({ ...current, comments: Math.max(0, current.comments - 1) }));
      void loadProductMetrics([product.id]).then((nextMetrics) => {
        const next = nextMetrics.get(product.id);
        if (next) setMetrics((current) => ({ ...current, ...next }));
      }).catch(() => undefined);
    } catch (error) {
      setMessage(language === 'en' ? t('authError') : error instanceof Error ? error.message : t('authError'));
    } finally {
      setBusy(false);
    }
  };

  return <div className="mt-3 border-t border-[#d3d4bf] pt-2" dir={language === 'en' ? 'ltr' : 'rtl'}>
    {showProductExtras && metrics.ratingCount > 0 && <div className="mb-1 flex items-center gap-1.5 text-base" aria-label={`${t('rating')} ${metrics.rating.toFixed(1)} ${t('outOf')} 5 ${t('basedOn')} ${metrics.ratingCount} ${t('reviews')}`}>
      <Star size={18} className="fill-amber-500 text-amber-600" />
      <span className="font-semibold">{metrics.rating.toFixed(1)}</span>
      <span className="text-sm text-[#535449]">({metrics.ratingCount} {t('reviews')})</span>
    </div>}
    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
      <button type="button" onClick={() => void toggle('like')} disabled={busy} aria-pressed={liked} aria-label={t('likeProduct')} className={`flex min-h-10 w-full items-center justify-start gap-1.5 px-2 text-[15px] transition-colors ${liked ? 'text-red-700' : 'text-[#68705d] hover:text-red-700'}`}><Heart size={18} className={liked ? 'fill-current' : ''} />{metrics.likes}</button>
      <button type="button" onClick={() => void openComments()} aria-expanded={feedbackPanel === 'comments'} aria-label={t('productComments')} className="flex min-h-10 w-full items-center justify-start gap-1.5 px-2 text-[15px] text-[#68705d] hover:text-[#563C2E]"><MessageCircle size={18} />{metrics.comments}</button>
      {showProductExtras && <button type="button" onClick={() => setFeedbackPanel('review')} aria-label={t('reviewProduct')} aria-expanded={feedbackPanel === 'review'} title={t('reviewProduct')} className="flex min-h-10 w-full items-center justify-start gap-1.5 px-2 text-[15px] font-semibold text-[#68704B] hover:text-[#4E563C]"><Star size={18} />{metrics.ratingCount || ''}</button>}
      {showProductExtras && <button type="button" onClick={() => void toggle('save')} disabled={busy} aria-pressed={saved} aria-label={t('savesLabel')} className={`flex min-h-10 w-full items-center justify-start gap-1.5 px-2 text-[15px] transition-colors ${saved ? 'text-[#563C2E]' : 'text-[#68705d] hover:text-[#563C2E]'}`}><Bookmark size={18} className={saved ? 'fill-current' : ''} />{metrics.saves}</button>}
    </div>
    {feedbackPanel && createPortal(<AnimatePresence>
      <motion.div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && setFeedbackPanel(null)}>
        <motion.section role="dialog" aria-modal="true" aria-labelledby="product-feedback-title" dir={language === 'en' ? 'ltr' : 'rtl'} className="flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-[#faf8f2] text-[#4E563C] shadow-2xl" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }}>
          <header className="flex shrink-0 items-center justify-between border-b border-[#d4d2b5] px-5 py-4 sm:px-6">
            <div><h2 id="product-feedback-title" className="text-xl font-bold">{feedbackPanel === 'comments' ? t('productComments') : t('yourReview')}</h2><p className="mt-1 text-base text-[#68705d]">{subjectLabel || (language === 'ar' ? product.nameAr : product.name)}</p></div>
            <button type="button" onClick={() => setFeedbackPanel(null)} className="grid size-11 shrink-0 place-items-center text-[#606748] hover:text-[#a56c4f]" aria-label={t('close')}><X size={23} /></button>
          </header>
          <div className="overflow-y-auto p-5 sm:p-6">
            {feedbackPanel === 'comments' ? <div className="space-y-5">
              {user || !configured ? <form onSubmit={submitComment} className="space-y-3"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} rows={3} className="field min-h-24 resize-y text-base" placeholder={t('writeComment')} /><button type="submit" disabled={busy || !draft.trim()} className="flex min-h-12 w-full items-center justify-center gap-2 bg-[#563C2E] px-4 py-3 text-base font-bold text-white disabled:opacity-40"><Send size={18} />{t('sendComment')}</button></form> : <button type="button" onClick={() => { setFeedbackPanel(null); onRequireAuth(); }} className="w-full border border-[#b8bea0] py-3 text-base">{t('signInToComment')}</button>}
              {message && <p role="status" className="text-base text-red-700">{message}</p>}
              <div className="max-h-64 space-y-4 overflow-y-auto">{comments.map((comment) => {
                const canDelete = Boolean(profile?.is_store_owner || (user && comment.user_id === user.id));
                return <article key={comment.id} className="border-b border-[#d4d2b5] pb-3 text-base"><div className="flex items-center justify-between gap-2"><p className="min-w-0 font-semibold">{comment.display_name}</p><div className="flex shrink-0 items-center gap-1">{comment.rating && <span className="flex items-center gap-1 text-sm"><Star size={16} className="fill-amber-500 text-amber-600" />{comment.rating}/5</span>}{canDelete && <button type="button" onClick={() => void removeComment(comment)} disabled={busy} aria-label={`${t('deleteComment')} ${comment.display_name}`} title={t('deleteComment')} className="grid size-10 place-items-center rounded-md text-red-700 hover:bg-red-50 disabled:opacity-50"><Trash2 size={17} /></button>}</div></div><p className="mt-1 whitespace-pre-wrap text-[#4f5a4a]">{comment.body}</p></article>;
              })}{!comments.length && <p className="text-base text-[#68705d]">{t('noComments')}</p>}</div>
            </div> : <form onSubmit={submitReview} className="space-y-4">
              <div><label className="mb-2 block text-base font-semibold text-[#414235]">{t('yourReview')}</label><div className="flex items-center gap-2" role="radiogroup" aria-label={t('starCount')}>
                {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" role="radio" aria-checked={reviewRating === value} aria-label={`${value} ${t('stars')}`} onClick={() => setReviewRating(value)} className="grid size-11 place-items-center text-amber-600 hover:scale-110"><Star size={27} className={value <= reviewRating ? 'fill-amber-500' : 'text-[#aaa995]'} /></button>)}
              </div></div>
              <input value={reviewName} onChange={(event) => setReviewName(event.target.value)} maxLength={80} className="field text-base" placeholder={t('yourNameOptional')} />
              <textarea value={reviewDraft} onChange={(event) => setReviewDraft(event.target.value)} maxLength={1000} rows={4} className="field min-h-28 resize-y text-base" placeholder={t('writeReview')} required />
              <button type="submit" disabled={busy || !reviewDraft.trim()} className="min-h-12 w-full bg-[#606748] px-4 py-3 text-base font-semibold text-white disabled:opacity-40">{t('submitReview')}</button>
              {reviewMessage && <p role="status" className="text-base text-[#68704B]">{reviewMessage}</p>}
            </form>}
          </div>
        </motion.section>
      </motion.div>
    </AnimatePresence>, document.body)}
  </div>;
}
