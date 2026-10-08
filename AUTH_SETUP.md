# Supabase Setup and Security

The storefront uses Supabase Auth for credentials and Supabase Postgres for shared store data. It never stores account passwords in storefront tables; Supabase Auth handles password hashing and verification.

1. Copy `.env.example` to `.env.local` and enter only the Supabase Project URL and publishable/anon key. Keep `.env.local` out of source control. Never put a service-role or secret key in a `VITE_*` variable or browser bundle.
2. Run `supabase.sql` in the Supabase SQL Editor. It enables RLS for application tables and storage, installs owner-only policies, validates checkout prices against the saved catalog, and protects guest tracking with a private random code. Rerun it on existing projects to apply the updated policies and remove the old number-only order lookup.
3. Old guest orders created before tracking codes were introduced cannot be looked up by customers after this migration; owners can still access them in the admin panel. New codes are shown once after checkout. Ask customers to keep both the order number and private code.
4. In Supabase Authentication settings, enable email/password and email confirmation. Set the minimum password length to at least 12 characters, enable leaked-password protection where available, and set the production site URL and exact redirect allowlist. Add local origins only for development.
5. To enable password recovery by email code, configure the Supabase Auth "Reset Password" email template to include `{{ .Token }}`. The customer enters that code in the storefront, which verifies it as a recovery OTP before setting the new password.
6. To enable Google, create a Google OAuth web client and enter its client ID and secret in Supabase Authentication > Providers > Google. Add the Supabase callback URL shown by that provider to the Google OAuth redirect URIs. Never put the Google client secret in frontend environment variables.
7. Create the store owner's account through the storefront. Then promote that exact account from the SQL Editor, replacing the example address:

```sql
update public.profiles
set is_store_owner = true
where lower(email) = lower('owner@example.com');
```

8. Sign in as the owner and save the product catalog in the admin panel before accepting orders. Checkout is rejected until product prices and available colors exist in `store_settings`.

## Loyalty and abandoned-cart reminders

9. Run the updated `supabase.sql` in the SQL Editor. It creates the private loyalty ledger and account balance, adds the public loyalty configuration, and creates service-role-only cart and push-subscription tables. Re-running the script is supported.
10. Copy `.env.server.example` to `.env.server`. Fill in the Supabase URL and service-role key on the server only. Configure OneSignal as described below. `.env.server` is ignored by Git. VAPID keys are optional and only needed to retain the legacy browser-push provider.
11. Set `VITE_BACKEND_URL=http://localhost:3001` and `VITE_ONESIGNAL_APP_ID` in `.env.local`, and set `CORS_ORIGIN=http://localhost:5173` in `.env.server`. Run `npm run backend` and `npm run dev` in separate terminals. Web push requires HTTPS outside localhost.
12. Abandoned carts become eligible after 3 hours without activity and receive another reminder at most once every 24 hours. Vercel runs the protected `GET /api/cron/abandoned-cart-reminders` job daily using the schedule in `vercel.json`; configure the server-only `CRON_SECRET` environment variable so Vercel can authenticate the job. If using an external scheduler instead, disable the Vercel cron and call the endpoint daily with `Authorization: Bearer <CRON_SECRET>` to avoid duplicate reminders.

For Vercel deployments, `api/[...path].js` exposes the Express backend on the same origin as the storefront. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as server-only Vercel environment variables; also set `CORS_ORIGIN` to the storefront origin and `FRONTEND_URL` to its public URL. Leave `VITE_BACKEND_URL` unset to use the current origin, including preview deployments. Do not set it to the Supabase project URL. Redeploy after changing environment variables. Never expose the service-role key in a `VITE_*` variable.

## OneSignal and Cron-job.org

Create a free OneSignal app, enable its Web platform, and enter the exact storefront origin. Put its App ID in both `VITE_ONESIGNAL_APP_ID` (frontend) and `ONESIGNAL_APP_ID` (backend); keep the REST API key only in `.env.server` as `ONESIGNAL_REST_API_KEY`. The app registers the OneSignal SDK worker at `/push/onesignal/OneSignalSDKWorker.js`, separate from the storefront's root worker. The browser's subscription ID is saved in `onesignal_push_subscriptions`; the service-role backend is the only writer/reader.

For external Cron-job.org scheduling, create an HTTP job with method `POST`, URL `https://YOUR_BACKEND/api/cron/abandoned-cart-reminders`, and header `Authorization: Bearer YOUR_CRON_SECRET`. Schedule it once daily only if the Vercel cron is disabled. Generate a long random token for `CRON_SECRET`; never put it in frontend variables. A missing or incorrect token is rejected. Confirm the job's response is HTTP 200 and `{ "ok": true }`.

## Casper shipping

Set `CASPER_LOGIN` and `CASPER_PASSWORD` in `.env.server`; `CASPER_DB` is optional and defaults to `casper`. After checkout saves the order, the backend sends a JSON-RPC `create_order` request to Casper. `GET /api/shipping/statuses` calls `get_statuses`, and `GET /api/shipping/orders/:orderNumber/status` calls `get_status` with the order number as `reference_id`. The status endpoint URLs default to Casper's `/get_statuses` and `/get_status` paths and can be overridden with `CASPER_STATUSES_URL` and `CASPER_ORDER_STATUS_URL`. Requests time out after 10 seconds; missing credentials return HTTP 503, while an HTTP or JSON-RPC failure from Casper returns HTTP 502.

Owners can adjust points earned per currency unit, redemption value, and dated campaign multipliers in the loyalty tab. Multipliers match a product type, category, or product name. Customers can see their balance in their account and redeem points at checkout; earning occurs on delivery, and cancellation refunds redeemed points. The backend uses the service-role key for private cart/subscription writes and sends at most one reminder per unchanged cart.

The owner-only wheel tab controls whether the wheel is visible and edits its prize slices, probabilities, reward type, value, and color. Probabilities must total 100%. A signed-in account or browser visitor ID can spin once; points are recorded in the loyalty ledger, guest point prizes can be claimed after sign-in, and generated discount codes are single-use at checkout. The customer popup dismissal and result are cached locally, while the database remains authoritative.

Products in this project are stored as JSONB entries in `store_settings.value` rather than a relational `products` table. Product archival uses the `isArchived` property on each entry. Public catalog reads go through `get_public_products()` and return active products only; owner-only catalog saves archive omitted records. Run the updated `supabase.sql` before using this filtering in a connected project.

Supabase Auth already persists browser sessions across visits and refreshes access tokens (`persistSession` and `autoRefreshToken` are enabled in the client). Keep production on HTTPS and do not clear the site's browser storage if the customer expects the same device to remain signed in.

## Product SEO and sharing

The storefront updates title, description, canonical, Open Graph, and Twitter tags for an open product. Product share buttons use `/share/product/:id` on the backend so link-preview crawlers receive product metadata in the initial HTML before the page redirects to `/?product=:id`. Set `FRONTEND_URL` in `.env.server` to the public storefront origin and `VITE_BACKEND_URL` in the frontend build environment to the public backend origin. Both must use HTTPS in production.

The admin control is rendered only for that profile. RLS policies independently restrict product/content edits, order management, media uploads, and interaction moderation to store owners. Public settings reads are limited to the product catalog and public site content. Customer orders require a private tracking code; submitted reviews and comments remain hidden until an owner approves them.

Customers can register by email, sign in with Google, or continue as guests. Checkout does not request an email address. Guests need both the order number and private tracking code to look up an order. Signed-in customers see their order history and product interactions in their account.

Before production, use HTTPS, restrict the Supabase Auth redirect allowlist to production domains, and configure server-side rate limiting/anti-bot checks for public checkout and guest-review RPCs. Those RPCs must remain callable by guests for the current storefront workflow, so RLS does not prevent automated submissions. Review Supabase Auth and API logs after launch.
