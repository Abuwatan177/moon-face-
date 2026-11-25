import { randomUUID } from 'node:crypto';

const API_URL = 'https://api.lahza.io';
const DEFAULT_EMAIL = 'customer@moon-face.com';

export class PaymentGatewayError extends Error {
  constructor(message = 'بوابة الدفع الإلكتروني غير مهيأة.', status = 503) {
    super(message);
    this.name = 'PaymentGatewayError';
    this.status = status;
  }
}

function getSecretKey() {
  const secretKey = process.env.LAHZA_SECRET_KEY?.trim();
  if (!secretKey) throw new PaymentGatewayError();
  return secretKey;
}

function getCallbackUrl() {
  let frontendUrl;
  try {
    frontendUrl = new URL(process.env.FRONTEND_URL || 'https://moon-face.com');
  } catch {
    throw new PaymentGatewayError('عنوان صفحة المتجر غير صالح لإتمام الدفع.');
  }
  if (frontendUrl.protocol !== 'https:' && frontendUrl.hostname !== 'localhost') {
    throw new PaymentGatewayError('عنوان صفحة المتجر غير آمن لإتمام الدفع.');
  }
  return new URL('/payment/callback', frontendUrl).href;
}

async function requestLahza(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${getSecretKey()}`,
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new PaymentGatewayError('استجابة بوابة الدفع غير صالحة.');
    }
    if (!response.ok || result?.status !== true || !result.data) {
      throw new PaymentGatewayError('تعذر التواصل مع بوابة الدفع.');
    }
    return result.data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createPaymentSession({ orderId, amountILS, customerEmail, customerPhone }) {
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    throw new PaymentGatewayError('رقم الطلب غير صالح.', 400);
  }
  const amount = Math.round(Number(amountILS) * 100);
  if (!Number.isFinite(Number(amountILS)) || amount <= 0 || !Number.isSafeInteger(amount)
    || Math.abs(Number(amountILS) * 100 - amount) > 1e-8) {
    throw new PaymentGatewayError('قيمة الطلب غير صالحة للدفع.', 400);
  }
  const email = typeof customerEmail === 'string' ? customerEmail.trim() : '';
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new PaymentGatewayError('البريد الإلكتروني غير صالح.', 400);
  }
  const phone = typeof customerPhone === 'string' ? customerPhone.trim().slice(0, 32) : '';
  const reference = `moon-${orderId}-${randomUUID()}`;
  const data = await requestLahza('/transaction/initialize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: String(amount),
      currency: 'ILS',
      email: email || DEFAULT_EMAIL,
      mobile: phone,
      reference,
      callback_url: getCallbackUrl(),
      metadata: JSON.stringify({ order_id: orderId, customer_phone: phone }),
    }),
  });
  let authorizationUrl;
  try {
    authorizationUrl = new URL(data.authorization_url);
  } catch {
    throw new PaymentGatewayError('لم تُرجع بوابة الدفع رابط تفويض صالحًا.');
  }
  if (authorizationUrl.protocol !== 'https:' || authorizationUrl.hostname !== 'checkout.lahza.io') {
    throw new PaymentGatewayError('رابط الدفع المُعاد من البوابة غير صالح.');
  }
  return { authorizationUrl: authorizationUrl.href, reference, amount: amount / 100, currency: 'ILS' };
}

export async function verifyPayment(reference) {
  if (typeof reference !== 'string' || !/^[A-Za-z0-9.=~-]{1,128}$/.test(reference)) {
    throw new PaymentGatewayError('مرجع الدفع غير صالح.', 400);
  }
  const data = await requestLahza(`/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' });
  if (data.reference !== reference) throw new PaymentGatewayError('مرجع الدفع لا يطابق العملية.', 400);
  return {
    paid: data.status === 'success',
    reference: data.reference,
    amount: Number(data.amount),
    currency: data.currency,
  };
}
