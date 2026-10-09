import { createHash, timingSafeEqual } from 'node:crypto';
import express from 'express';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const { SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY } = process.env;
const missingSupabaseVariables = [
  !supabaseUrl && 'SUPABASE_URL or VITE_SUPABASE_URL',
  !SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
].filter(Boolean);
const supabase = missingSupabaseVariables.length ? null : createClient(supabaseUrl, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const app = express();
const port = Number(process.env.API_PORT || 3001);
const casperLogin = process.env.CASPER_LOGIN?.trim();
const casperPassword = process.env.CASPER_PASSWORD;
const casperDatabase = process.env.CASPER_DB?.trim() || 'casper';
const casperStatusesUrl = process.env.CASPER_STATUSES_URL?.trim() || 'https://casper.delivery/get_statuses';
const casperOrderStatusUrl = process.env.CASPER_ORDER_STATUS_URL?.trim() || 'https://casper.delivery/get_status';
const cronJobToken = process.env.CRON_SECRET?.trim() || process.env.CRON_JOB_TOKEN?.trim();
const configuredAbandonmentMinutes = Number(process.env.CART_ABANDONMENT_MINUTES || 180);
const abandonmentMinutes = Number.isFinite(configuredAbandonmentMinutes) ? Math.max(180, configuredAbandonmentMinutes) : 180;
const reminderRepeatMinutes = 24 * 60;
const cartSessionWriteIntervalMs = 24 * 60 * 60 * 1000;
const cartSessionRetryIntervalMs = 5 * 60 * 1000;
const cartSessionWriteTimes = new Map();
const recentErrorLogs = new Map();
const errorLogCooldownMs = 60_000;
const allowedOrigins = new Set([
  ...(process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((origin) => origin.trim()),
  'https://moon-face.com',
  'https://www.moon-face.com',
]);
const frontendOrigin = new URL(process.env.FRONTEND_URL || [...allowedOrigins][0]).origin;
let vapidConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
const oneSignalConfigured = Boolean(ONESIGNAL_APP_ID && ONESIGNAL_REST_API_KEY);

function logLimitedError(key, ...details) {
  const now = Date.now();
  const previous = recentErrorLogs.get(key);
  if (previous && now - previous.loggedAt < errorLogCooldownMs) {
    previous.suppressed += 1;
    return;
  }
  if (recentErrorLogs.size >= 500) {
    const oldestKey = recentErrorLogs.keys().next().value;
    if (oldestKey !== undefined) recentErrorLogs.delete(oldestKey);
  }
  recentErrorLogs.set(key, { loggedAt: now, suppressed: 0 });
  console.error(...details, ...(previous?.suppressed ? [`${previous.suppressed} similar errors suppressed`] : []));
}

if (vapidConfigured) {
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  } catch {
    vapidConfigured = false;
    console.warn('Invalid VAPID configuration; legacy browser push is disabled.');
  }
}

app.use((request, response, next) => {
  const origin = request.get('origin');
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cart-Session');
  if (request.method === 'OPTIONS') return response.sendStatus(204);
  next();
});
app.use(express.json({ limit: '24kb' }));

function sessionIdFrom(request) {
  const sessionId = request.get('x-cart-session');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId || '')) {
    throw Object.assign(new Error('Invalid cart session.'), { status: 400 });
  }
  return sessionId;
}

async function getIdentity(request) {
  const sessionId = sessionIdFrom(request);
  const authorization = request.get('authorization');
  if (!authorization) return { sessionId, userId: null };
  const token = authorization.replace(/^Bearer\s+/i, '');
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Invalid authentication token.'), { status: 401 });
  return { sessionId, userId: data.user.id };
}

async function requireStoreOwner(request) {
  const token = request.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('Authentication required.'), { status: 401 });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Authentication required.'), { status: 401 });
  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('is_store_owner').eq('id', data.user.id).maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.is_store_owner) throw Object.assign(new Error('Store owner access required.'), { status: 403 });
  return data.user;
}

function cleanCartItems(items) {
  if (!Array.isArray(items) || items.length > 50) throw Object.assign(new Error('Invalid cart items.'), { status: 400 });
  return items.map((item) => {
    const price = Number(item?.price);
    const quantity = Number(item?.quantity);
    if (!Number.isSafeInteger(Number(item?.id)) || !Number.isFinite(price) || price < 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw Object.assign(new Error('Invalid cart item.'), { status: 400 });
    }
    return {
      id: Number(item.id),
      name: String(item.name || '').slice(0, 160),
      color: String(item.color || '').slice(0, 80),
      price,
      quantity,
    };
  });
}

async function callCasper(endpoint, method, params) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ jsonrpc: '2.9', method, params }),
    });
    let rpcResponse;
    try {
      rpcResponse = await response.json();
    } catch {
      throw new Error(`Casper ${method} returned invalid JSON (HTTP ${response.status}).`);
    }
    if (!response.ok || !rpcResponse || typeof rpcResponse !== 'object' || Array.isArray(rpcResponse)
      || rpcResponse.error || !Object.hasOwn(rpcResponse, 'result')) {
      throw new Error(`Casper ${method} failed (HTTP ${response.status}): ${rpcResponse?.error?.message || 'Invalid JSON-RPC response.'}`);
    }
    return rpcResponse.result;
  } finally {
    clearTimeout(timeout);
  }
}

function claimCartSessionWrite(sessionId) {
  const now = Date.now();
  const previousWrite = cartSessionWriteTimes.get(sessionId);
  if (previousWrite && now - previousWrite < cartSessionWriteIntervalMs) return false;

  for (const [savedSessionId, writtenAt] of cartSessionWriteTimes) {
    if (now - writtenAt >= cartSessionWriteIntervalMs) cartSessionWriteTimes.delete(savedSessionId);
  }
  if (cartSessionWriteTimes.size >= 10_000) {
    const oldestSessionId = cartSessionWriteTimes.keys().next().value;
    if (oldestSessionId !== undefined) cartSessionWriteTimes.delete(oldestSessionId);
  }
  cartSessionWriteTimes.set(sessionId, now);
  return true;
}

function deferCartSessionWriteRetry(sessionId) {
  cartSessionWriteTimes.set(sessionId, Date.now() + cartSessionRetryIntervalMs - cartSessionWriteIntervalMs);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function getShareImageUrl(source) {
  try {
    const image = new URL(String(source || ''), frontendOrigin);
    if (image.protocol === 'http:' || image.protocol === 'https:') return image.href;
  } catch {
    return new URL('/media/favicon.svg', frontendOrigin).href;
  }
  return new URL('/media/favicon.svg', frontendOrigin).href;
}

app.get('/api/health', (_request, response) => {
  if (!supabase) return response.status(503).json({ ok: false, error: `Missing server environment variables: ${missingSupabaseVariables.join(', ')}` });
  response.json({ ok: true });
});

app.use((_request, response, next) => {
  if (!supabase) return response.status(503).json({ error: 'Backend configuration is incomplete.' });
  next();
});

app.get(['/share/product/:id', '/api/share/product/:id'], async (request, response, next) => {
  const productId = Number(request.params.id);
  if (!Number.isSafeInteger(productId) || productId <= 0) return response.status(400).send('Invalid product ID.');

  try {
    const { data, error } = await supabase.from('store_settings').select('value').eq('key', 'products').maybeSingle();
    if (error) throw error;
    const product = (Array.isArray(data?.value) ? data.value : []).find((item) => Number(item.id) === productId);
    if (!product) return response.status(404).send('Product not found.');

    const productName = String(product.nameAr || product.name || 'Moon Face').slice(0, 160);
    const category = String(product.category || '').slice(0, 100);
    const title = `${productName} | Moon Face`;
    const description = `${productName}${category ? `، ضمن قسم ${category}` : ''}. السعر ₪${Number(product.price) || 0}. اكتشفي التفاصيل والألوان المتاحة.`.slice(0, 300);
    const imageUrl = getShareImageUrl(product.image);
    const productUrl = `${frontendOrigin}/?product=${productId}`;
    const shareUrl = JSON.stringify(productUrl).replace(/</g, '\\u003c');

    response.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.type('html').send(`<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${escapeHtml(productUrl)}">
    <meta property="og:site_name" content="Moon Face">
    <meta property="og:type" content="product">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:image" content="${escapeHtml(imageUrl)}">
    <meta property="og:url" content="${escapeHtml(productUrl)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  </head>
  <body>
    <p>يتم فتح صفحة المنتج...</p>
    <a href="${escapeHtml(productUrl)}">${escapeHtml(title)}</a>
    <script>window.location.replace(${shareUrl});</script>
  </body>
</html>`);
  } catch (error) {
    next(error);
  }
});

app.get('/api/push/public-key', (_request, response) => {
  if (!vapidConfigured) return response.status(503).json({ error: 'Push notifications are not configured.' });
  response.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post('/api/cart-sessions', async (request, response, next) => {
  try {
    const identity = await getIdentity(request);
    if (request.body?.sessionId !== identity.sessionId) return response.status(400).json({ error: 'Session mismatch.' });
    const items = cleanCartItems(request.body.items);
    if (!claimCartSessionWrite(identity.sessionId)) return response.sendStatus(204);
    const { error } = await supabase.from('abandoned_cart_sessions').upsert({
      session_id: identity.sessionId,
      user_id: identity.userId,
      items,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      deferCartSessionWriteRetry(identity.sessionId);
      throw error;
    }
    response.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/cart-sessions', async (request, response, next) => {
  try {
    const identity = await getIdentity(request);
    const { error } = await supabase.from('abandoned_cart_sessions').delete().eq('session_id', identity.sessionId);
    if (error) throw error;
    response.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

app.get('/api/cart-reminders/status', async (request, response, next) => {
  try {
    const sessionId = sessionIdFrom(request);
    const [oneSignalResult, pushResult] = await Promise.all([
      supabase.from('onesignal_push_subscriptions').select('subscription_id').eq('session_id', sessionId).limit(1).maybeSingle(),
      supabase.from('push_subscriptions').select('endpoint_hash').eq('session_id', sessionId).limit(1).maybeSingle(),
    ]);
    if (oneSignalResult.error) throw oneSignalResult.error;
    if (pushResult.error) throw pushResult.error;
    response.json({ enabled: Boolean(oneSignalResult.data || pushResult.data) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/onesignal-subscriptions', async (request, response, next) => {
  if (!oneSignalConfigured) {
    return response.status(503).json({ error: 'خدمة OneSignal غير مهيأة على الخادم. تحقق من إعدادات الإشعارات.' });
  }
  try {
    const identity = await getIdentity(request);
    const subscriptionId = String(request.body?.subscriptionId || '');
    if (request.body?.sessionId !== identity.sessionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(subscriptionId)) {
      return response.status(400).json({ error: 'Invalid OneSignal subscription.' });
    }
    const { error } = await supabase.from('onesignal_push_subscriptions').upsert({
      subscription_id: subscriptionId,
      session_id: identity.sessionId,
      user_id: identity.userId,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    response.sendStatus(204);
  } catch (error) {
    logLimitedError('onesignal-subscription', 'Could not save OneSignal subscription:', error.message);
    response.status(503).json({ error: 'تعذر تسجيل اشتراك الإشعارات على الخادم. تحقق من اتصال قاعدة البيانات ثم أعد المحاولة.' });
  }
});

app.get('/api/shipping/statuses', async (_request, response) => {
  if (!casperLogin || !casperPassword) {
    return response.status(503).json({ error: 'Casper delivery is not configured.' });
  }
  try {
    const statuses = await callCasper(casperStatusesUrl, 'get_statuses', {
      login: casperLogin,
      password: casperPassword,
      db: casperDatabase,
    });
    response.json({ statuses });
  } catch (error) {
    logLimitedError('casper-statuses', 'Casper statuses request failed:', error.message);
    response.status(502).json({ error: 'Unable to retrieve Casper shipping statuses.' });
  }
});

app.get('/api/shipping/orders/:orderNumber/status', async (request, response) => {
  const orderNumber = Number(request.params.orderNumber);
  if (!Number.isSafeInteger(orderNumber) || orderNumber <= 0) {
    return response.status(400).json({ error: 'Invalid order number.' });
  }
  if (!casperLogin || !casperPassword) {
    return response.status(503).json({ error: 'Casper delivery is not configured.' });
  }
  try {
    const status = await callCasper(casperOrderStatusUrl, 'get_status', {
      login: casperLogin,
      password: casperPassword,
      db: casperDatabase,
      reference_id: orderNumber,
    });
    response.json({ orderNumber, status });
  } catch (error) {
    logLimitedError('casper-order-status', `Casper status request failed for order ${orderNumber}:`, error.message);
    response.status(502).json({ error: 'Unable to retrieve the Casper order status.' });
  }
});

app.post('/api/shipping/orders', async (request, response) => {
  const body = request.body || {};
  const orderNumber = Number(body.orderNumber);
  const customer = body.customer || {};
  const total = Number(body.total);
  if (!Number.isSafeInteger(orderNumber) || orderNumber <= 0
    || typeof customer.name !== 'string' || !customer.name.trim() || customer.name.length > 120
    || typeof customer.phone !== 'string' || customer.phone.trim().length < 5 || customer.phone.length > 32
    || typeof customer.address !== 'string' || !customer.address.trim() || customer.address.length > 500
    || typeof body.region !== 'string' || body.region.length > 80
    || !Number.isFinite(total) || total < 0) {
    return response.status(400).json({ error: 'Invalid shipping order.' });
  }

  if (!casperLogin || !casperPassword) {
    return response.status(503).json({ error: 'Casper delivery is not configured.' });
  }

  try {
    cleanCartItems(body.items);
  } catch {
    return response.status(400).json({ error: 'Invalid shipping order.' });
  }

  try {
    await callCasper('https://casper.delivery/create_order', 'create_order', {
      login: casperLogin,
      password: casperPassword,
      db: casperDatabase,
      customer_address: customer.address.trim(),
      customer_mobile: customer.phone.trim(),
      customer_name: customer.name.trim(),
      customer_area: body.region,
      cost: total,
      order_type_id: '1',
      note: typeof body.product_note === 'string' ? body.product_note.slice(0, 500) : '',
      paid: false,
      delivery_fee_on_customer: false,
      delivery_fee_on_sender: false,
    });
    response.sendStatus(204);
  } catch (error) {
    logLimitedError('casper-create-order', `Casper request failed for order ${orderNumber}:`, error.message);
    response.status(502).json({ error: 'Casper delivery provider is unavailable.' });
  }
});

app.post('/api/push-subscriptions', async (request, response, next) => {
  try {
    const identity = await getIdentity(request);
    if (request.body?.sessionId !== identity.sessionId) return response.status(400).json({ error: 'Session mismatch.' });
    const subscription = request.body?.subscription;
    if (typeof subscription?.endpoint !== 'string' || !subscription.endpoint.startsWith('https://') || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return response.status(400).json({ error: 'Invalid push subscription.' });
    }
    const endpointHash = createHash('sha256').update(subscription.endpoint).digest('hex');
    const { error } = await supabase.from('push_subscriptions').upsert({
      endpoint_hash: endpointHash,
      session_id: identity.sessionId,
      user_id: identity.userId,
      subscription,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    response.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

async function sendOneSignalReminder(subscriptionId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: { Authorization: `Key ${ONESIGNAL_REST_API_KEY}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        target_channel: 'push',
        include_subscription_ids: [subscriptionId],
        headings: { en: 'Moon Face', ar: 'Moon Face' },
        contents: { en: 'You still have products waiting in your shopping bag.', ar: 'ما زالت هناك منتجات بانتظارك في سلتك.' },
        url: `${frontendOrigin}/?utm_source=cart-reminder`,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`OneSignal returned HTTP ${response.status}.`);
    return Boolean(result.id);
  } finally {
    clearTimeout(timeout);
  }
}

async function sendAbandonedCartReminders() {
  if (!vapidConfigured && !oneSignalConfigured) throw new Error('Configure OneSignal or VAPID before running the abandoned-cart job.');
  const now = Date.now();
  const inactiveBefore = new Date(now - abandonmentMinutes * 60_000).toISOString();
  const reminderDueBefore = new Date(now - reminderRepeatMinutes * 60_000).toISOString();
  const { data: carts, error } = await supabase
    .from('abandoned_cart_sessions')
    .select('session_id,items,updated_at')
    .lte('updated_at', inactiveBefore)
    .or(`last_reminded_at.is.null,last_reminded_at.lte.${reminderDueBefore}`)
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error) throw error;

  const eligibleCarts = (carts || []).filter((cart) => Array.isArray(cart.items) && cart.items.length > 0);
  const sessionIds = eligibleCarts.map((cart) => cart.session_id);
  const [legacyResult, oneSignalResult] = sessionIds.length ? await Promise.all([
      vapidConfigured
        ? supabase.from('push_subscriptions').select('endpoint_hash,session_id,subscription').in('session_id', sessionIds).limit(1000)
        : Promise.resolve({ data: [], error: null }),
      oneSignalConfigured
        ? supabase.from('onesignal_push_subscriptions').select('session_id,subscription_id').in('session_id', sessionIds).limit(1000)
        : Promise.resolve({ data: [], error: null }),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (legacyResult.error) throw legacyResult.error;
  if (oneSignalResult.error) throw oneSignalResult.error;

  const legacyBySession = new Map();
  for (const subscription of legacyResult.data || []) {
    const sessionSubscriptions = legacyBySession.get(subscription.session_id) || [];
    sessionSubscriptions.push(subscription);
    legacyBySession.set(subscription.session_id, sessionSubscriptions);
  }
  const oneSignalBySession = new Map();
  for (const subscription of oneSignalResult.data || []) {
    const sessionSubscriptions = oneSignalBySession.get(subscription.session_id) || [];
    sessionSubscriptions.push(subscription);
    oneSignalBySession.set(subscription.session_id, sessionSubscriptions);
  }

  const deliveredCarts = [];
  for (const cart of eligibleCarts) {
    const legacySubscriptions = legacyBySession.get(cart.session_id) || [];
    const oneSignalSubscriptions = oneSignalBySession.get(cart.session_id) || [];
    if (!legacySubscriptions.length && !oneSignalSubscriptions.length) continue;
    let delivered = false;
    for (const subscription of legacySubscriptions) {
      try {
        await webpush.sendNotification(subscription.subscription, JSON.stringify({
          title: 'Moon Face',
          body: 'ما زالت هناك منتجات بانتظارك في سلتك.',
          url: '/?utm_source=cart-reminder',
        }));
        delivered = true;
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint_hash', subscription.endpoint_hash);
        } else {
          logLimitedError('abandoned-cart-webpush', 'Push delivery failed:', error.message);
        }
      }
    }
    for (const subscription of oneSignalSubscriptions) {
      try {
        if (await sendOneSignalReminder(subscription.subscription_id)) delivered = true;
      } catch (error) {
        logLimitedError('abandoned-cart-onesignal', `OneSignal delivery failed for cart ${cart.session_id}:`, error.message);
      }
    }
    if (delivered) deliveredCarts.push(cart.session_id);
  }

  if (deliveredCarts.length) {
    const { error: updateError } = await supabase.from('abandoned_cart_sessions')
      .update({ last_reminded_at: new Date().toISOString() })
      .in('session_id', deliveredCarts)
      .lte('updated_at', inactiveBefore);
    if (updateError) throw updateError;
  }
  return { scanned: (carts || []).length };
}

function isAuthorizedCronRequest(request) {
  if (!cronJobToken) return false;
  const supplied = Buffer.from(request.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${cronJobToken}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

const runAbandonedCartReminderJob = async (request, response) => {
  if (!cronJobToken) return response.status(503).json({ error: 'Cron job authentication is not configured.' });
  if (!isAuthorizedCronRequest(request)) return response.status(401).json({ error: 'Unauthorized.' });
  try {
    const result = await sendAbandonedCartReminders();
    response.json({ ok: true, ...result });
  } catch (error) {
    logLimitedError('abandoned-cart-job', 'Abandoned cart job failed:', error.message);
    response.status(500).json({ error: 'Abandoned cart job failed.' });
  }
};
app.get('/api/cron/abandoned-cart-reminders', runAbandonedCartReminderJob);
app.post('/api/cron/abandoned-cart-reminders', runAbandonedCartReminderJob);

app.post('/api/admin/notifications', async (request, response, next) => {
  try {
    await requireStoreOwner(request);
    const title = String(request.body?.title || 'Moon Face').trim().slice(0, 80);
    const message = String(request.body?.message || '').trim();
    if (!message || message.length > 500) return response.status(400).json({ error: 'اكتب نصاً من 1 إلى 500 حرف.' });
    if (!oneSignalConfigured && !vapidConfigured) return response.status(503).json({ error: 'خدمة الإشعارات غير مهيأة على الخادم.' });

    let oneSignalSent = 0;
    if (oneSignalConfigured) {
      const pushResponse = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: { Authorization: `Key ${ONESIGNAL_REST_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: ONESIGNAL_APP_ID,
          included_segments: ['Subscribed Users'],
          headings: { en: title, ar: title },
          contents: { en: message, ar: message },
          url: frontendOrigin,
        }),
      });
      const result = await pushResponse.json().catch(() => ({}));
      if (!pushResponse.ok) throw new Error(`OneSignal returned HTTP ${pushResponse.status}.`);
      oneSignalSent = Number(result.recipients) || 0;
    }

    let webPushSent = 0;
    let webPushFailed = 0;
    if (vapidConfigured) {
      const { data: subscriptions, error } = await supabase.from('push_subscriptions')
        .select('endpoint_hash,subscription').limit(10_000);
      if (error) throw error;
      for (let index = 0; index < (subscriptions || []).length; index += 40) {
        const batch = subscriptions.slice(index, index + 40);
        const results = await Promise.allSettled(batch.map(async (entry) => {
          try {
            await webpush.sendNotification(entry.subscription, JSON.stringify({ title, body: message, url: '/' }));
            webPushSent += 1;
          } catch (error) {
            webPushFailed += 1;
            if (error.statusCode === 404 || error.statusCode === 410) {
              await supabase.from('push_subscriptions').delete().eq('endpoint_hash', entry.endpoint_hash);
            }
          }
        }));
        if (results.some((result) => result.status === 'rejected')) webPushFailed += results.filter((result) => result.status === 'rejected').length;
      }
    }

    response.json({ ok: true, oneSignalSent, webPushSent, webPushFailed, sent: oneSignalSent + webPushSent });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  if (!Number.isInteger(error.status) || error.status >= 500) {
    logLimitedError(`api-${error.status || 500}-${error.code || error.name || 'error'}`, 'API request failed:', error.message);
  }
  response.status(error.status || 500).json({ error: error.status ? error.message : 'Internal server error.' });
});

export default app;

if (process.env.VERCEL !== '1') {
  app.listen(port, () => console.log(`Moon Face backend listening on port ${port}; abandoned-cart reminders run through the protected cron endpoint.`));
}