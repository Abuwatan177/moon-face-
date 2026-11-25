import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, LoaderCircle } from 'lucide-react';
import { useLanguage } from '../i18n';
import { verifyCardPayment } from '../lib/api';

type PaymentState = 'checking' | 'paid' | 'cancelled' | 'failed';

export default function PaymentResultPage() {
  const { language } = useLanguage();
  const [state, setState] = useState<PaymentState>('checking');
  const [currency, setCurrency] = useState('ILS');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('status') === 'cancelled') {
      setState('cancelled');
      return;
    }
    if (params.get('status') !== 'success' && !params.has('signature')) {
      setState('failed');
      return;
    }
    const orderId = params.get('order-ext-ref');
    if (!orderId) {
      setState('failed');
      return;
    }

    let active = true;
    void verifyCardPayment(orderId, params.toString())
      .then((result) => {
        if (!active) return;
        setCurrency(result.currency);
        setState('paid');
        try { localStorage.removeItem('moon-face-cart'); } catch { /* The payment result is still valid. */ }
      })
      .catch(() => { if (active) setState('failed'); });
    return () => { active = false; };
  }, []);

  const copy = language === 'en'
    ? {
      checking: 'Verifying your payment', checkingText: 'We are confirming the signed transaction with 2Checkout.',
      paid: 'Payment confirmed', paidText: `Your payment was verified successfully in ${currency}.`,
      cancelled: 'Payment cancelled', cancelledText: 'No successful payment was confirmed. You can return to the store and try again.',
      failed: 'Payment not verified', failedText: 'We could not verify this payment. Please contact Moon Face before placing another order.', back: 'Return to store',
    }
    : {
      checking: 'جارٍ التحقق من الدفع', checkingText: 'نتحقق من توقيع العملية مع 2Checkout.',
      paid: 'تم تأكيد الدفع', paidText: `تم التحقق من دفعتك بنجاح بعملة ${currency}.`,
      cancelled: 'تم إلغاء الدفع', cancelledText: 'لم نتلق تأكيدًا بعملية دفع ناجحة. يمكنك العودة إلى المتجر والمحاولة مجددًا.',
      failed: 'تعذر التحقق من الدفع', failedText: 'لم نتمكن من التحقق من هذه الدفعة. يرجى التواصل مع Moon Face قبل إنشاء طلب آخر.', back: 'العودة إلى المتجر',
    };
  const details = { checking: copy.checkingText, paid: copy.paidText, cancelled: copy.cancelledText, failed: copy.failedText }[state];
  const icon = state === 'checking'
    ? <LoaderCircle className="animate-spin" size={30} />
    : state === 'paid' ? <CheckCircle2 size={32} /> : <CircleAlert size={32} />;

  return <main className="grid min-h-screen place-items-center bg-[#f6f3e8] px-5 py-12 text-[#3d4432]" dir={language === 'en' ? 'ltr' : 'rtl'}>
    <section className="w-full max-w-xl border-y border-[#d9cbb8] px-2 py-10 text-center sm:px-8">
      <a href="/" className="font-display text-2xl font-semibold text-[#3D2C22]">Moon Face</a>
      <div className={`mx-auto mt-8 grid size-16 place-items-center rounded-full ${state === 'paid' ? 'bg-[#e2e7d4] text-[#5f6548]' : state === 'checking' ? 'bg-[#ede5d9] text-[#5f6548]' : 'bg-[#f3e3dc] text-[#9a5539]'}`} aria-live="polite">{icon}</div>
      <h1 className="mt-5 text-2xl font-bold text-[#3D2C22]">{copy[state]}</h1>
      <p className="mt-3 leading-7 text-[#535449]">{details}</p>
      <a href="/" className="mt-7 inline-flex min-h-11 items-center justify-center rounded-md bg-[#3D2C22] px-6 font-semibold text-white hover:bg-[#5f6548]">{copy.back}</a>
    </section>
  </main>;
}