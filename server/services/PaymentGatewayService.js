const unavailableMessage = 'لم يتم تفعيل الدفع بالبطاقة بعد. يرجى اختيار الدفع عند الاستلام.';

export class PaymentGatewayError extends Error {
  constructor(message = unavailableMessage, status = 503) {
    super(message);
    this.name = 'PaymentGatewayError';
    this.status = status;
  }
}

function assertSessionInput(input) {
  const orderId = Number(input?.orderId);
  const productsAmount = Number(input?.productsAmount);
  const customerEmail = typeof input?.customerEmail === 'string' ? input.customerEmail.trim() : '';

  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    throw new PaymentGatewayError('رقم الطلب غير صالح.', 400);
  }
  const amountInMinorUnits = Math.round(productsAmount * 100);
  if (!Number.isFinite(productsAmount) || productsAmount <= 0 || !Number.isSafeInteger(amountInMinorUnits)
    || Math.abs(productsAmount * 100 - amountInMinorUnits) > 1e-8) {
    throw new PaymentGatewayError('قيمة المنتجات غير صالحة.', 400);
  }
  if (customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    throw new PaymentGatewayError('البريد الإلكتروني غير صالح.', 400);
  }

  return { orderId, productsAmount, customerEmail, currency: 'ILS' };
}

export async function createPaymentSession(input) {
  const payment = assertSessionInput(input);

  // TODO: Map exact CyberSource session fields and verify productsAmount against a server-calculated order total.
  // Do not call a gateway or issue a session until the merchant's official integration contract is configured.
  void payment;
  throw new PaymentGatewayError();
}

export async function processPaymentWebhook(_request) {
  // TODO: Verify CyberSource's documented webhook signature and event schema before any order mutation.
  // Do not treat browser redirects or unsigned webhook payloads as payment confirmation.
  throw new PaymentGatewayError();
}

export async function verifyPaymentForOrder(orderId) {
  if (!/^[1-9]\d{0,17}$/.test(String(orderId))) {
    throw new PaymentGatewayError('رقم الطلب غير صالح.', 400);
  }

  // TODO: Query CyberSource with the documented transaction lookup API and reconcile idempotently in Supabase.
  throw new PaymentGatewayError();
}
