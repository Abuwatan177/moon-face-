import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { Product } from '../data/products';
import { useLanguage } from '../i18n';
import StoredMedia from './StoredMedia';

export type OrderPreviewData = {
  id: number;
  customer: { name?: string; phone?: string; address?: string };
  region?: string;
  items: { id: number; name: string; color?: string; size?: string; price: number; quantity: number }[];
  subtotal?: number;
  discount?: number;
  promoCode?: string;
  deliveryFee?: number;
  total: number;
  status?: string;
  createdAt: string;
};

export default function OrderPreviewDialog({ order, products, onClose }: { order: OrderPreviewData; products: Product[]; onClose: () => void }) {
  const { language, t } = useLanguage();
  const subtotal = order.subtotal ?? order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = order.discount || 0;
  const deliveryFee = order.deliveryFee ?? Math.max(0, order.total - subtotal + discount);
  const statusLabels: Record<string, string> = {
    new: t('statusNew'),
    cancelled: t('statusCancelled'),
    postponed: t('statusPostponed'),
    delivered: t('statusDelivered'),
    exchanged: t('statusExchanged'),
  };
  const formatMoney = (value: number) => `₪${new Intl.NumberFormat(language === 'en' ? 'en-US' : 'ar-u-nu-latn', { maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
  const date = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ar-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.createdAt));

  return <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/55 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.section role="dialog" aria-modal="true" aria-labelledby="order-preview-title" dir={language === 'en' ? 'ltr' : 'rtl'} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="relative my-auto max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-xl bg-[#faf8f5] p-4 text-[#4E563C] shadow-2xl sm:p-6">
      <button type="button" onClick={onClose} aria-label={t('close')} className="absolute left-3 top-3 grid size-9 place-items-center rounded-full hover:bg-[#e8e7da]"><X size={18} /></button>
      <header className="border-b border-[#d3d4bf] pb-4 pe-10">
        <h2 id="order-preview-title" className="text-lg font-bold">{t('orderPreview')} #{order.id}</h2>
        <p className="mt-1 text-xs text-[#737865]">{t('orderDate')}: {date}</p>
        {order.status && <p className="mt-1 text-xs text-[#737865]">{t('orderStatus')}: {statusLabels[order.status] || order.status}</p>}
      </header>
      <section className="grid gap-x-4 gap-y-2 border-b border-[#d3d4bf] py-4 text-sm sm:grid-cols-2">
        {order.customer.name && <p><span className="text-[#737865]">{t('name')}: </span>{order.customer.name}</p>}
        {order.customer.phone && <p><span className="text-[#737865]">{t('phone')}: </span><bdi dir="ltr">{order.customer.phone}</bdi></p>}
        {order.region && <p><span className="text-[#737865]">{t('region')}: </span>{order.region}</p>}
        {order.customer.address && <p className="sm:col-span-2"><span className="text-[#737865]">{t('address')}: </span>{order.customer.address}</p>}
      </section>
      <section className="py-4">
        <h3 className="mb-3 text-sm font-bold">{t('orderContents')}</h3>
        <div className="space-y-3">
          {order.items.map((item, index) => {
            const product = products.find((candidate) => candidate.id === item.id);
            const itemImage = product?.colors.find((color) => color.name === item.color)?.image
              || product?.images.find((image) => image.color === item.color)?.img
              || product?.image
              || '';
            return <article key={`${item.id}-${index}`} className="flex gap-3 border-b border-[#e5e4d8] pb-3 last:border-0 last:pb-0">
              <StoredMedia type="image" source={itemImage} alt={item.name} className="size-20 shrink-0 rounded-lg bg-[#eeecdf] object-cover" />
              <div className="min-w-0 flex-1">
                <h4 className="font-bold">{item.name}</h4>
                <p className="mt-1 text-xs text-[#737865]">{item.color && <>{t('color')}: {item.color}</>}{item.color && item.size && ' · '}{item.size && <>{t('size')}: {item.size}</>}</p>
                <p className="mt-1 text-xs text-[#737865]">{t('quantity')}: {item.quantity} × {formatMoney(item.price)}</p>
              </div>
              <b className="shrink-0 text-sm">{formatMoney(item.price * item.quantity)}</b>
            </article>;
          })}
          {!order.items.length && <p className="py-4 text-center text-sm text-[#737865]">{t('emptyOrderItems')}</p>}
        </div>
      </section>
      <section className="space-y-2 border-t border-[#d3d4bf] pt-4 text-sm">
        <div className="flex justify-between"><span>{t('subtotal')}</span><span>{formatMoney(subtotal)}</span></div>
        {discount > 0 && <div className="flex justify-between text-green-800"><span>{t('couponDiscount')}{order.promoCode ? ` (${order.promoCode})` : ''}</span><span>-{formatMoney(discount)}</span></div>}
        {!discount && order.promoCode && <div className="flex justify-between"><span>{t('couponPlaceholder')}</span><span>{order.promoCode}</span></div>}
        <div className="flex justify-between"><span>{t('deliveryFee')}</span><span>{formatMoney(deliveryFee)}</span></div>
        <div className="flex justify-between border-t border-[#d3d4bf] pt-3 text-base font-bold"><span>{t('total')}</span><span>{formatMoney(order.total)}</span></div>
      </section>
    </motion.section>
  </div>;
}