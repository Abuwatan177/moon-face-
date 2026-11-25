import { createHmac, timingSafeEqual } from 'node:crypto';

const unavailableMessage = 'بوابة 2Checkout غير مهيأة. يرجى اختيار الدفع عند الاستلام.';

export class PaymentGatewayError extends Error {
  constructor(message = unavailableMessage, status = 503) {
    super(message);
    this.name = 'PaymentGatewayError';
    this.status = status;
  }
}

function paymentConfig() {
  const merchantCode = process.env.TWOCHECKOUT_MERCHANT_CODE?.trim();
  const secretKey = process.env.TWOCHECKOUT_SECRET_KEY?.trim();
  if (!merchantCode || !secretKey) throw new PaymentGatewayError();
  return { merchantCode, secretKey, sandbox: process.env.TWOCHECKOUT_SANDBOX_MODE === 'true' };
}

function serializeParameters(parameters) {
  return Object.entries(parameters)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([, value]) => {
      const text = String(value);
      return `${Buffer.byteLength(text, 'utf8')}${text}`;
    })
    .join('');
}

function createSignature(parameters, secretKey) {
  return createHmac('sha256', secretKey).update(serializeParameters(parameters), 'utf8').digest('hex');
}

function assertSessionInput(input) {
  const orderId = Number(input?.orderId);
  const productsAmount = Number(input?.productsAmount);
  const customerEmail = typeof input?.customerEmail === 'string' ? input.customerEmail.trim() : '';
  const currency = typeof input?.currency === 'string' ? input.currency.toUpperCase() : '';

  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    throw new PaymentGatewayError('رقم الطلب غير صالح.', 400);
  }
  const amountInMinorUnits = Math.round(productsAmount * 100);
  if (!Number.isFinite(productsAmount) || productsAmount <= 0 || !Number.isSafeInteger(amountInMinorUnits)
    || Math.abs(productsAmount * 100 - amountInMinorUnits) > 1e-8) {
    throw new PaymentGatewayError('قيمة المنتجات غير صالحة.', 400);
  }
  if (customerEmail && (customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))) {
    throw new PaymentGatewayError('البريد الإلكتروني غير صالح.', 400);
  }
  if (!['ILS', 'USD'].includes(currency)) throw new PaymentGatewayError('العملة غير مدعومة.', 400);

  return { orderId, productsAmount, customerEmail, currency };
}

export async function createPaymentSession(input) {
  const payment = assertSessionInput(input);
  const { merchantCode, secretKey, sandbox } = paymentConfig();
  const frontendUrl = new URL(process.env.FRONTEND_URL || 'https://moon-face.com');
  if (frontendUrl.protocol !== 'https:' && frontendUrl.hostname !== 'localhost') {
    throw new PaymentGatewayError('عنوان الموقع غير آمن لإتمام الدفع.', 503);
  }
  const successUrl = new URL('/payment-result', frontendUrl);
  const cancelUrl = new URL('/payment-result', frontendUrl);
  cancelUrl.searchParams.set('status', 'cancelled');
  const signedParams = {
    'back-url': cancelUrl.href,
    currency: payment.currency,
    'order-ext-ref': String(payment.orderId),
    price: payment.productsAmount.toFixed(2),
    prod: `Moon Face order ${payment.orderId}`,
    qty: '1',
    'return-type': 'redirect',
    'return-url': successUrl.href,
    tangible: '1',
    type: 'PRODUCT',
  };
  const query = new URLSearchParams({ merchant: merchantCode, dynamic: '1', ...signedParams });
  query.set('signature', createSignature(signedParams, secretKey));
  if (payment.customerEmail) query.set('email', payment.customerEmail);
  if (sandbox) query.set('test', '1');

  return {
    checkoutUrl: `https://secure.2checkout.com/checkout/buy/?${query.toString()}`,
    orderId: payment.orderId,
    amount: payment.productsAmount,
    currency: payment.currency,
  };
}

export async function processPaymentWebhook(_request) {
  throw new PaymentGatewayError();
}

export async function verifyPaymentForOrder(orderId, rawQuery, expectedAmount, expectedCurrency) {
  if (!/^[1-9]\d{0,17}$/.test(String(orderId))) {
    throw new PaymentGatewayError('رقم الطلب غير صالح.', 400);
  }
  const { merchantCode, secretKey } = paymentConfig();
  const params = new URLSearchParams(rawQuery || '');
  const values = {};
  for (const [key, value] of params) {
    if (Object.hasOwn(values, key)) throw new PaymentGatewayError('تعذر التحقق من نتيجة الدفع.', 400);
    values[key] = value;
  }
  const signature = values.signature;
  delete values.signature;
  if (!signature || !/^[a-f\d]{64}$/i.test(signature)) throw new PaymentGatewayError('توقيع الدفع غير صالح.', 400);
  const expectedSignature = createSignature(values, secretKey);
  const receivedBytes = Buffer.from(signature, 'hex');
  const expectedBytes = Buffer.from(expectedSignature, 'hex');
  if (receivedBytes.length !== expectedBytes.length || !timingSafeEqual(receivedBytes, expectedBytes)) {
    throw new PaymentGatewayError('تعذر التحقق من توقيع الدفع.', 400);
  }
  if (values.merchant !== merchantCode || values['order-ext-ref'] !== String(orderId)
    || !values.refno || !['ILS', 'USD'].includes(values['total-currency'])
    || values['total-currency'] !== expectedCurrency) {
    throw new PaymentGatewayError('بيانات الدفع لا تطابق الطلب.', 400);
  }
  const returnedAmount = Number(values.total);
  if (!Number.isFinite(returnedAmount) || Math.round(returnedAmount * 100) !== Math.round(Number(expectedAmount) * 100)) {
    throw new PaymentGatewayError('المبلغ المدفوع لا يطابق الطلب.', 400);
  }

  return { paid: true, orderId: Number(orderId), transactionId: values.refno, currency: expectedCurrency };
}
