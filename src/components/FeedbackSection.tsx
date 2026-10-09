import { useState, type FormEvent, type MouseEventHandler } from 'react';
import { Send } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa6';
import { useLanguage } from '../i18n';
import { saveStoreFeedback } from '../lib/api';

type FeedbackKind = 'opinion' | 'note' | 'idea';

export default function FeedbackSection({ recipient }: { recipient: string }) {
  const { language, t } = useLanguage();
  const [kind, setKind] = useState<FeedbackKind>('opinion');
  const [name, setName] = useState('');
  const [replyEmail, setReplyEmail] = useState('');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const kinds: { value: FeedbackKind; label: string }[] = [
    { value: 'opinion', label: t('feedbackOpinion') },
    { value: 'note', label: t('feedbackNote') },
    { value: 'idea', label: t('feedbackIdea') },
  ];
  const createFeedbackBody = () => [
    `${t('feedbackType')}: ${t(`feedback${kind === 'opinion' ? 'Opinion' : kind === 'note' ? 'Note' : 'Idea'}`)}`,
    `${t('feedbackName')}: ${name.trim() || '-'}`,
    `${t('feedbackReplyEmail')}: ${replyEmail.trim() || '-'}`,
    `${t('feedbackMessage')}:\n${message.trim()}`,
  ].join('\n\n');

  const submitFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!recipient.trim()) {
      setNotice(t('feedbackEmailMissing'));
      return;
    }
    try {
      await saveStoreFeedback({ kind, name, replyEmail, message });
    } catch (error) {
      console.error('Could not save store feedback:', error);
      setNotice(t('feedbackSaveError'));
      return;
    }
    const body = createFeedbackBody();
    window.location.href = `mailto:${recipient.trim()}?subject=${encodeURIComponent(`Moon Face | ${t('feedbackTitle')}`)}&body=${encodeURIComponent(body)}`;
    setNotice(t('feedbackEmailOpening'));
  };

  const sendFeedbackByWhatsApp: MouseEventHandler<HTMLButtonElement> = async (event) => {
    if (!event.currentTarget.form?.reportValidity()) return;
    const whatsappWindow = window.open('about:blank', '_blank');
    if (!whatsappWindow) {
      setNotice(t('feedbackPopupBlocked'));
      return;
    }
    whatsappWindow.opener = null;
    try {
      await saveStoreFeedback({ kind, name, replyEmail, message });
    } catch (error) {
      console.error('Could not save store feedback:', error);
      whatsappWindow.close();
      setNotice(t('feedbackSaveError'));
      return;
    }
    whatsappWindow.location.href = `https://wa.me/970599789591?text=${encodeURIComponent(createFeedbackBody())}`;
    setNotice(t('feedbackWhatsAppOpening'));
  };

  return (
    <section id="feedback" dir={language === 'en' ? 'ltr' : 'rtl'} className="bg-[#e8e5d2]/55 py-12 sm:py-16">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:px-12">
        <header className="max-w-md">
          <span className="text-xs font-bold text-earth-clay">Moon Face</span>
          <h2 className="mt-2 text-3xl font-extrabold text-moon-face-900 sm:text-4xl">{t('feedbackTitle')}</h2>
        </header>
        <form onSubmit={submitFeedback} className="space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('feedbackType')}>
            {kinds.map((item) => <button key={item.value} type="button" aria-pressed={kind === item.value} onClick={() => setKind(item.value)} className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${kind === item.value ? 'border-[#514332] bg-[#514332] text-white' : 'border-moon-face-300 bg-white/60 text-moon-face-800 hover:bg-white'}`}>{item.label}</button>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="field bg-white/85" value={name} onChange={(event) => setName(event.target.value)} placeholder={t('feedbackName')} aria-label={t('feedbackName')} />
            <input className="field bg-white/85" type="email" value={replyEmail} onChange={(event) => setReplyEmail(event.target.value)} placeholder={t('feedbackReplyEmail')} aria-label={t('feedbackReplyEmail')} />
          </div>
          <textarea className="field min-h-36 resize-y bg-white/85" required value={message} onChange={(event) => { setMessage(event.target.value); setNotice(''); }} placeholder={t('feedbackMessage')} aria-label={t('feedbackMessage')} />
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-[#514332] px-5 py-3 font-bold text-white transition-colors hover:bg-[#6B704B]">
              <Send size={17} /> {t('feedbackSubmit')}
            </button>
            <button type="button" onClick={sendFeedbackByWhatsApp} className="inline-flex items-center gap-2 rounded-lg bg-[#20b95a] px-5 py-3 font-bold text-white transition-colors hover:bg-[#159947]">
              <FaWhatsapp size={19} /> {t('feedbackWhatsApp')}
            </button>
            {notice && <p role="status" className="text-sm text-moon-face-800">{notice}</p>}
          </div>
        </form>
      </div>
    </section>
  );
}