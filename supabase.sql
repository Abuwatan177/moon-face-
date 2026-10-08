create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  is_store_owner boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.is_store_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_store_owner);
$$;
revoke all on function public.is_store_owner() from public;
grant execute on function public.is_store_owner() to anon, authenticated;

create or replace function public.protect_owner_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and new.is_store_owner is distinct from old.is_store_owner and not public.is_store_owner() then
    raise exception 'Only a store owner may change owner privileges';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_owner_flag() from public;

drop trigger if exists protect_owner_flag on public.profiles;
create trigger protect_owner_flag before update on public.profiles
for each row execute function public.protect_owner_flag();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
drop policy if exists "profile owner read" on public.profiles;
create policy "profile owner read" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_store_owner());
drop policy if exists "profile owner update" on public.profiles;
create policy "profile owner update" on public.profiles for update to authenticated
using (id = auth.uid() or public.is_store_owner())
with check (id = auth.uid() or public.is_store_owner());

create table if not exists public.store_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.store_settings enable row level security;
drop policy if exists "public read store settings" on public.store_settings;
create policy "public read store settings" on public.store_settings for select to anon, authenticated using (key in ('site_content', 'loyalty_config', 'wheel_config'));
drop policy if exists "owner manage store settings" on public.store_settings;
create policy "owner manage store settings" on public.store_settings for all to authenticated
using (public.is_store_owner()) with check (public.is_store_owner());

create or replace function public.get_public_products()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  catalog jsonb;
begin
  select value into catalog from public.store_settings where key = 'products';
  if not found then return null; end if;
  if pg_catalog.jsonb_typeof(catalog) <> 'array' then return '[]'::jsonb; end if;
  return (
    select coalesce(pg_catalog.jsonb_agg(products.product order by products.ordinality), '[]'::jsonb)
    from pg_catalog.jsonb_array_elements(catalog) with ordinality as products(product, ordinality)
    where products.product->>'isArchived' is distinct from 'true'
  );
end;
$$;
revoke all on function public.get_public_products() from public;
grant execute on function public.get_public_products() to anon, authenticated;

create table if not exists public.orders (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_email text,
  customer_phone text not null,
  customer_address text not null,
  region text not null,
  payload jsonb not null,
  status text not null default 'new' check (status in ('new','cancelled','postponed','delivered','exchanged')),
  created_at timestamptz not null default now()
);
alter table public.orders add column if not exists tracking_token_hash text;
create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
alter table public.orders alter column customer_email drop not null;
drop index if exists public.orders_tracking_lookup_idx;
alter table public.orders drop constraint if exists orders_tracking_code_key;
alter table public.orders drop column if exists tracking_code;
alter table public.orders enable row level security;
drop policy if exists "customer reads own orders" on public.orders;
create policy "customer reads own orders" on public.orders for select to authenticated
using (user_id = auth.uid() or public.is_store_owner());
drop policy if exists "owner updates orders" on public.orders;
create policy "owner updates orders" on public.orders for update to authenticated
using (public.is_store_owner()) with check (public.is_store_owner());
drop policy if exists "owner deletes orders" on public.orders;
create policy "owner deletes orders" on public.orders for delete to authenticated using (public.is_store_owner());

drop function if exists public.create_store_order(jsonb, text, text, text, text, text);
drop function if exists public.create_store_order(jsonb, text, text, text, text);
create or replace function public.create_store_order(
  p_payload jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_region text,
  p_loyalty_points_to_redeem integer default 0
)
returns table(order_number bigint, tracking_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_order_number bigint;
  tracking_token_value text;
  catalog jsonb;
  catalog_product jsonb;
  checkout_item jsonb;
  validated_items jsonb := '[]'::jsonb;
  trusted_payload jsonb;
  trusted_subtotal numeric := 0;
  trusted_discount numeric := 0;
  trusted_loyalty_discount numeric := 0;
  trusted_delivery_fee numeric;
  loyalty_settings jsonb;
  customer_points integer := 0;
  point_value numeric := 0.01;
  wheel_coupon_spin_id uuid;
  wheel_coupon_discount_percent numeric;
  promo_code text;
  item_quantity integer;
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object'
    or pg_catalog.pg_column_size(p_payload) > 65536
    or coalesce(pg_catalog.jsonb_typeof(p_payload->'items'), '') <> 'array'
    or pg_catalog.jsonb_array_length(p_payload->'items') not between 1 and 50 then
    raise exception 'Invalid order';
  end if;

  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_customer_name, ''))) not between 1 and 120
    or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_customer_phone, ''))) not between 5 and 32
    or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_customer_address, ''))) not between 1 and 500 then
    raise exception 'Invalid customer details';
  end if;

  trusted_delivery_fee := case p_region
    when 'الضفة' then 20
    when 'القدس' then 30
    when 'الداخل' then 70
    else null
  end;
  if trusted_delivery_fee is null then
    raise exception 'Invalid delivery region';
  end if;

  select value into catalog from public.store_settings where key = 'products';
  if catalog is null or pg_catalog.jsonb_typeof(catalog) <> 'array' then
    raise exception 'Product catalog is unavailable';
  end if;

  for checkout_item in select item.value from pg_catalog.jsonb_array_elements(p_payload->'items') as item(value)
  loop
    if coalesce(checkout_item->>'id', '') !~ '^[0-9]{1,18}$'
      or coalesce(checkout_item->>'quantity', '') !~ '^[1-9][0-9]{0,1}$' then
      raise exception 'Invalid order item';
    end if;
    item_quantity := (checkout_item->>'quantity')::integer;

    select product.value into catalog_product
    from pg_catalog.jsonb_array_elements(catalog) as product(value)
    where product.value->>'id' = checkout_item->>'id'
    limit 1;
    if catalog_product is null
      or catalog_product->>'isArchived' = 'true'
      or coalesce(catalog_product->>'price', '') !~ '^(0|[1-9][0-9]{0,7})(\.[0-9]{1,2})?$'
      or not exists (
        select 1 from pg_catalog.jsonb_array_elements(coalesce(catalog_product->'colors', '[]'::jsonb)) as color(value)
        where color.value->>'name' = checkout_item->>'color' and color.value->>'available' = 'true'
      ) then
      raise exception 'Invalid or unavailable product option';
    end if;

    trusted_subtotal := trusted_subtotal + (catalog_product->>'price')::numeric * item_quantity;
    validated_items := validated_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', (catalog_product->>'id')::bigint,
      'name', catalog_product->>'name',
      'color', checkout_item->>'color',
      'price', (catalog_product->>'price')::numeric,
      'quantity', item_quantity,
      'productType', catalog_product->>'productType',
      'category', catalog_product->>'category'
    ));
  end loop;

  promo_code := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_payload->>'promoCode', ''))), '');
  if promo_code is not null and promo_code <> 'moon-face.10' then
    select id, reward_value into wheel_coupon_spin_id, wheel_coupon_discount_percent
    from public.wheel_spins
    where pg_catalog.upper(reward_code) = pg_catalog.upper(promo_code)
      and reward_type = 'discount'
      and redeemed_order_id is null
    limit 1 for update;
    if not found then raise exception 'Invalid or already redeemed discount code'; end if;
  end if;
  if promo_code = 'moon-face.10' then
    trusted_discount := pg_catalog.round(trusted_subtotal * 0.1, 2);
  elsif wheel_coupon_spin_id is not null then
    if wheel_coupon_discount_percent <= 0 or wheel_coupon_discount_percent > 100 then
      raise exception 'Invalid wheel discount';
    end if;
    trusted_discount := pg_catalog.round(trusted_subtotal * wheel_coupon_discount_percent / 100, 2);
  end if;

  if p_loyalty_points_to_redeem < 0 or p_loyalty_points_to_redeem > 100000 then
    raise exception 'Invalid loyalty points';
  end if;
  if p_loyalty_points_to_redeem > 0 then
    if auth.uid() is null then
      raise exception 'Sign in to redeem loyalty points';
    end if;
    select value into loyalty_settings from public.store_settings where key = 'loyalty_config';
    point_value := coalesce(nullif(loyalty_settings->>'currencyValuePerPoint', '')::numeric, 0.01);
    select points_balance into customer_points from public.loyalty_accounts where user_id = auth.uid() for update;
    if not found or customer_points < p_loyalty_points_to_redeem then
      raise exception 'Insufficient loyalty points';
    end if;
    trusted_loyalty_discount := pg_catalog.least(
      p_loyalty_points_to_redeem * point_value,
      trusted_subtotal - trusted_discount
    );
    if trusted_loyalty_discount < p_loyalty_points_to_redeem * point_value then
      raise exception 'Redeemed points exceed the order value';
    end if;
  end if;

  trusted_payload := p_payload || pg_catalog.jsonb_build_object(
    'customer', pg_catalog.jsonb_build_object('name', pg_catalog.btrim(p_customer_name), 'phone', pg_catalog.btrim(p_customer_phone), 'address', pg_catalog.btrim(p_customer_address)),
    'region', p_region,
    'items', validated_items,
    'subtotal', trusted_subtotal,
    'discount', trusted_discount,
    'loyaltyPointsRedeemed', p_loyalty_points_to_redeem,
    'loyaltyDiscount', trusted_loyalty_discount,
    'promoCode', coalesce(promo_code, ''),
    'deliveryFee', trusted_delivery_fee,
    'total', trusted_subtotal - trusted_discount - trusted_loyalty_discount + trusted_delivery_fee
  );
  tracking_token_value := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.orders (user_id, customer_name, customer_phone, customer_address, region, payload, tracking_token_hash)
  values (auth.uid(), pg_catalog.btrim(p_customer_name), pg_catalog.btrim(p_customer_phone), pg_catalog.btrim(p_customer_address), p_region, trusted_payload,
    pg_catalog.encode(extensions.digest(tracking_token_value, 'sha256'), 'hex'))
  returning id into created_order_number;
  if wheel_coupon_spin_id is not null then
    update public.wheel_spins set redeemed_order_id = created_order_number, redeemed_at = pg_catalog.now()
    where id = wheel_coupon_spin_id and redeemed_order_id is null;
    if not found then raise exception 'Discount code was already redeemed'; end if;
  end if;
  if p_loyalty_points_to_redeem > 0 then
    insert into public.loyalty_ledger (user_id, order_id, delta_points, reason, idempotency_key)
    values (auth.uid(), created_order_number, -p_loyalty_points_to_redeem, 'order_redeemed', 'order:' || created_order_number || ':redeemed');
    update public.loyalty_accounts set points_balance = points_balance - p_loyalty_points_to_redeem, updated_at = pg_catalog.now()
    where user_id = auth.uid();
  end if;
  return query select created_order_number, tracking_token_value;
end;
$$;

revoke all on function public.create_store_order(jsonb, text, text, text, text, integer) from public;
grant execute on function public.create_store_order(jsonb, text, text, text, text, integer) to anon, authenticated;

drop function if exists public.lookup_guest_order(bigint, text);
drop function if exists public.lookup_store_order(bigint);
drop function if exists public.lookup_store_order(bigint, text);
create or replace function public.lookup_store_order(p_order_number bigint, p_tracking_token text)
returns table(order_number bigint, status text, created_at timestamptz, total numeric, payload jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select orders.id, orders.status, orders.created_at, coalesce(nullif(orders.payload->>'total', '')::numeric, 0), orders.payload
  from public.orders as orders
  where orders.id = p_order_number
    and orders.tracking_token_hash is not null
    and coalesce(p_tracking_token, '') ~ '^[0-9a-fA-F]{64}$'
    and orders.tracking_token_hash = pg_catalog.encode(extensions.digest(pg_catalog.lower(p_tracking_token), 'sha256'), 'hex')
  limit 1;
$$;
revoke all on function public.lookup_store_order(bigint, text) from public;
grant execute on function public.lookup_store_order(bigint, text) to anon, authenticated;

create table if not exists public.product_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create table if not exists public.product_saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index if not exists product_likes_product_idx on public.product_likes(product_id);
create index if not exists product_saves_product_idx on public.product_saves(product_id);
create index if not exists product_likes_created_idx on public.product_likes(created_at desc);
create index if not exists product_saves_created_idx on public.product_saves(created_at desc);
create table if not exists public.product_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  product_id bigint not null,
  display_name text not null,
  body text not null check (char_length(body) between 1 and 2000),
  rating smallint check (rating is null or rating between 1 and 5),
  is_approved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.product_comments alter column user_id drop not null;
alter table public.product_comments add column if not exists rating smallint check (rating is null or rating between 1 and 5);
alter table public.product_comments alter column is_approved set default false;
create index if not exists product_comments_product_created_idx on public.product_comments(product_id, created_at desc);
create index if not exists product_comments_created_idx on public.product_comments(created_at desc);

create table if not exists public.store_feedback (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('opinion', 'note', 'idea')),
  name text not null default '' check (char_length(name) <= 120),
  reply_email text not null default '' check (char_length(reply_email) <= 254),
  message text not null check (char_length(message) between 1 and 5000),
  created_at timestamptz not null default now()
);
alter table public.store_feedback enable row level security;
drop policy if exists "public submit store feedback" on public.store_feedback;
create policy "public submit store feedback" on public.store_feedback for insert to anon, authenticated
with check (true);
drop policy if exists "owner reads store feedback" on public.store_feedback;
create policy "owner reads store feedback" on public.store_feedback for select to authenticated
using (public.is_store_owner());

alter table public.product_likes enable row level security;
alter table public.product_saves enable row level security;
alter table public.product_comments enable row level security;

drop policy if exists "users manage own likes" on public.product_likes;
create policy "users manage own likes" on public.product_likes for all to authenticated
using (user_id = auth.uid() or public.is_store_owner())
with check (user_id = auth.uid() or public.is_store_owner());
drop policy if exists "users manage own saves" on public.product_saves;
create policy "users manage own saves" on public.product_saves for all to authenticated
using (user_id = auth.uid() or public.is_store_owner())
with check (user_id = auth.uid() or public.is_store_owner());
grant select, insert, delete on public.product_likes, public.product_saves to authenticated;
grant select, insert, update, delete on public.product_comments to authenticated;
grant select, insert on public.product_comments to anon;
drop policy if exists "public read approved comments" on public.product_comments;
create policy "public read approved comments" on public.product_comments for select to anon, authenticated
using (is_approved or user_id = auth.uid() or public.is_store_owner());
drop policy if exists "users create comments" on public.product_comments;
drop policy if exists "authenticated create product feedback" on public.product_comments;
create policy "authenticated create product feedback" on public.product_comments for insert to authenticated
with check (not is_approved and user_id = auth.uid());
drop policy if exists "guests create star reviews" on public.product_comments;
create policy "guests create star reviews" on public.product_comments for insert to anon
with check (user_id is null and rating between 1 and 5 and not is_approved);
drop policy if exists "users delete own or owner comments" on public.product_comments;
create policy "users delete own or owner comments" on public.product_comments for delete to authenticated
using (user_id = auth.uid() or public.is_store_owner());
drop policy if exists "owner moderates comments" on public.product_comments;
create policy "owner moderates comments" on public.product_comments for update to authenticated
using (public.is_store_owner()) with check (public.is_store_owner());

drop function if exists public.get_product_metrics(bigint[]);
create function public.get_product_metrics(p_product_ids bigint[])
returns table(product_id bigint, like_count bigint, save_count bigint, comment_count bigint, average_rating numeric, rating_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_is_owner boolean := public.is_store_owner();
begin
  if cardinality(coalesce(p_product_ids, '{}'::bigint[])) > 100 then
    raise exception 'Too many product IDs';
  end if;
  return query select requested.id,
    (select count(*) from public.product_likes l where l.product_id = requested.id),
    (select count(*) from public.product_saves s where s.product_id = requested.id),
    comment_metrics.comment_count,
    comment_metrics.average_rating,
    comment_metrics.rating_count
  from unnest(p_product_ids) as requested(id)
  cross join lateral (
    select count(*) as comment_count,
      coalesce(avg(c.rating), 0)::numeric as average_rating,
      count(c.rating) as rating_count
    from public.product_comments c
    where c.product_id = requested.id
      and (c.is_approved or c.user_id = caller_user_id or caller_is_owner)
  ) as comment_metrics;
end;
$$;
revoke all on function public.get_product_metrics(bigint[]) from public;
grant execute on function public.get_product_metrics(bigint[]) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('store-media', 'store-media', true, 104857600)
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit;

drop policy if exists "store owner manage media" on storage.objects;
create policy "store owner manage media" on storage.objects for all to authenticated
using (bucket_id = 'store-media' and public.is_store_owner())
with check (bucket_id = 'store-media' and public.is_store_owner());

-- After the owner creates an account, promote that exact email from the SQL editor:
-- update public.profiles set is_store_owner = true where lower(email) = lower('owner@example.com');

-- Loyalty balances are backed by an immutable transaction ledger.
create table if not exists public.loyalty_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  points_balance integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.loyalty_accounts drop constraint if exists loyalty_accounts_points_balance_check;

create table if not exists public.loyalty_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id bigint references public.orders(id) on delete set null,
  delta_points integer not null check (delta_points <> 0),
  reason text not null check (reason in ('order_earned', 'order_reversed', 'order_redeemed', 'order_redemption_reversed', 'wheel_reward')),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
alter table public.loyalty_ledger drop constraint if exists loyalty_ledger_reason_check;
alter table public.loyalty_ledger add constraint loyalty_ledger_reason_check
check (reason in ('order_earned', 'order_reversed', 'order_redeemed', 'order_redemption_reversed', 'wheel_reward'));
create index if not exists loyalty_ledger_user_created_idx on public.loyalty_ledger(user_id, created_at desc);
create index if not exists loyalty_ledger_order_idx on public.loyalty_ledger(order_id, reason);

insert into public.store_settings (key, value)
values ('loyalty_config', '{"pointsPerCurrency":1,"currencyValuePerPoint":0.01,"campaigns":[]}'::jsonb)
on conflict (key) do nothing;

insert into public.loyalty_accounts (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function public.handle_loyalty_account_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.loyalty_accounts (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_loyalty_account_created() from public;
drop trigger if exists on_auth_user_loyalty_account_created on auth.users;
create trigger on_auth_user_loyalty_account_created after insert on auth.users
for each row execute function public.handle_loyalty_account_created();

alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_ledger enable row level security;
drop policy if exists "customers read own loyalty balance" on public.loyalty_accounts;
create policy "customers read own loyalty balance" on public.loyalty_accounts for select to authenticated
using (user_id = auth.uid() or public.is_store_owner());
drop policy if exists "customers read own loyalty ledger" on public.loyalty_ledger;
create policy "customers read own loyalty ledger" on public.loyalty_ledger for select to authenticated
using (user_id = auth.uid() or public.is_store_owner());

create or replace function public.get_loyalty_balance()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare balance integer;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  insert into public.loyalty_accounts (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select points_balance into balance from public.loyalty_accounts where user_id = auth.uid();
  return balance;
end;
$$;
revoke all on function public.get_loyalty_balance() from public;
grant execute on function public.get_loyalty_balance() to authenticated;

create or replace function public.award_order_loyalty_points()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings jsonb;
  points_per_currency numeric;
  earned_points integer;
  reversed_points integer;
  redeemed_points integer;
  changed_rows integer;
begin
  if old.status is distinct from new.status and new.user_id is not null then
    if new.status = 'delivered' then
      select value into settings from public.store_settings where key = 'loyalty_config';
      points_per_currency := coalesce(nullif(settings->>'pointsPerCurrency', '')::numeric, 1);
      select floor(coalesce(sum(
        (
          coalesce(nullif(item->>'price', '')::numeric, 0)
          * coalesce(nullif(item->>'quantity', '')::numeric, 0)
          * points_per_currency
          * coalesce((
            select max(nullif(campaign->>'multiplier', '')::numeric)
            from pg_catalog.jsonb_array_elements(coalesce(settings->'campaigns', '[]'::jsonb)) as campaigns(campaign)
            where (nullif(campaign->>'startsAt', '') is null or (campaign->>'startsAt')::timestamptz <= pg_catalog.now())
              and (nullif(campaign->>'endsAt', '') is null or (campaign->>'endsAt')::timestamptz >= pg_catalog.now())
              and case campaign->>'matchField'
                when 'productType' then pg_catalog.lower(coalesce(item->>'productType', '')) = pg_catalog.lower(coalesce(campaign->>'matchValue', ''))
                when 'category' then pg_catalog.lower(coalesce(item->>'category', '')) = pg_catalog.lower(coalesce(campaign->>'matchValue', ''))
                when 'name' then pg_catalog.lower(coalesce(item->>'name', '')) = pg_catalog.lower(coalesce(campaign->>'matchValue', ''))
                else false
              end
          ), 1)
        )
      ), 0))::integer
      into earned_points
      from pg_catalog.jsonb_array_elements(coalesce(new.payload->'items', '[]'::jsonb)) as items(item);

      earned_points := floor(earned_points * greatest(0, least(1,
        (coalesce(nullif(new.payload->>'subtotal', '')::numeric, 0)
          - coalesce(nullif(new.payload->>'discount', '')::numeric, 0)
          - coalesce(nullif(new.payload->>'loyaltyDiscount', '')::numeric, 0))
        / greatest(coalesce(nullif(new.payload->>'subtotal', '')::numeric, 0), 1)
      )))::integer;
      if earned_points > 0 then
        insert into public.loyalty_ledger (user_id, order_id, delta_points, reason, idempotency_key)
        values (new.user_id, new.id, earned_points, 'order_earned', 'order:' || new.id || ':earned')
        on conflict (idempotency_key) do nothing;
        get diagnostics changed_rows = row_count;
        if changed_rows > 0 then
          insert into public.loyalty_accounts (user_id, points_balance) values (new.user_id, earned_points)
          on conflict (user_id) do update set points_balance = public.loyalty_accounts.points_balance + excluded.points_balance, updated_at = pg_catalog.now();
        end if;
      end if;
    elsif old.status = 'delivered' then
      select coalesce(sum(delta_points), 0)::integer
      into reversed_points
      from public.loyalty_ledger
      where order_id = new.id and reason in ('order_earned', 'order_reversed');
      if reversed_points > 0 then
        insert into public.loyalty_ledger (user_id, order_id, delta_points, reason, idempotency_key)
        values (new.user_id, new.id, -reversed_points, 'order_reversed', 'order:' || new.id || ':reversed')
        on conflict (idempotency_key) do nothing;
        get diagnostics changed_rows = row_count;
        if changed_rows > 0 then
          update public.loyalty_accounts set points_balance = points_balance - reversed_points, updated_at = pg_catalog.now()
          where user_id = new.user_id;
        end if;
      end if;
    end if;

    if new.status = 'cancelled' then
      select coalesce(-sum(delta_points), 0)::integer
      into redeemed_points
      from public.loyalty_ledger
      where order_id = new.id and reason = 'order_redeemed';
      if redeemed_points > 0 then
        insert into public.loyalty_ledger (user_id, order_id, delta_points, reason, idempotency_key)
        values (new.user_id, new.id, redeemed_points, 'order_redemption_reversed', 'order:' || new.id || ':redemption-reversed')
        on conflict (idempotency_key) do nothing;
        get diagnostics changed_rows = row_count;
        if changed_rows > 0 then
          update public.loyalty_accounts set points_balance = points_balance + redeemed_points, updated_at = pg_catalog.now()
          where user_id = new.user_id;
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.award_order_loyalty_points() from public;
drop trigger if exists orders_award_loyalty_points on public.orders;
create trigger orders_award_loyalty_points after update of status on public.orders
for each row execute function public.award_order_loyalty_points();

create table if not exists public.onesignal_push_subscriptions (
  subscription_id uuid primary key,
  session_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists onesignal_push_subscriptions_session_idx on public.onesignal_push_subscriptions(session_id);
alter table public.onesignal_push_subscriptions enable row level security;

create table if not exists public.abandoned_cart_sessions (
  session_id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  items jsonb not null default '[]'::jsonb check (pg_catalog.jsonb_typeof(items) = 'array'),
  updated_at timestamptz not null default now(),
  last_reminded_at timestamptz
);
create index if not exists abandoned_cart_sessions_due_idx on public.abandoned_cart_sessions(updated_at)
where last_reminded_at is null;
create index if not exists abandoned_cart_sessions_updated_idx on public.abandoned_cart_sessions(updated_at desc);
create index if not exists abandoned_cart_sessions_reminded_idx on public.abandoned_cart_sessions(last_reminded_at, updated_at)
where last_reminded_at is not null;

create table if not exists public.push_subscriptions (
  endpoint_hash text primary key,
  session_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_session_idx on public.push_subscriptions(session_id);

alter table public.abandoned_cart_sessions enable row level security;
alter table public.push_subscriptions enable row level security;

create table if not exists public.wheel_spins (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  visitor_id uuid not null unique,
  prize jsonb not null,
  reward_type text not null check (reward_type in ('discount', 'points', 'none')),
  reward_value numeric not null default 0,
  reward_code text unique,
  points_claimed_by uuid references auth.users(id) on delete set null,
  points_claimed_at timestamptz,
  redeemed_order_id bigint,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.wheel_spins add column if not exists points_claimed_by uuid references auth.users(id) on delete set null;
alter table public.wheel_spins add column if not exists points_claimed_at timestamptz;
create unique index if not exists wheel_spins_user_once_idx on public.wheel_spins(user_id) where user_id is not null;
create unique index if not exists wheel_spins_points_claimed_by_once_idx on public.wheel_spins(points_claimed_by) where points_claimed_by is not null;
alter table public.wheel_spins enable row level security;
drop policy if exists "customers read own wheel spins" on public.wheel_spins;
create policy "customers read own wheel spins" on public.wheel_spins for select to authenticated
using (user_id = auth.uid() or public.is_store_owner());

create or replace function public.spin_wheel(p_visitor_id uuid)
returns table(spin_id uuid, prize jsonb, reward_code text, already_spun boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  configuration jsonb;
  slices jsonb;
  existing public.wheel_spins%rowtype;
  selected_slice jsonb;
  total_probability numeric;
  roll_value numeric;
  probability_cursor numeric := 0;
  reward_kind text;
  reward_amount numeric;
  generated_code text;
  created_spin_id uuid;
  points_to_award integer;
  current_user_id uuid := auth.uid();
begin
  if p_visitor_id is null then raise exception 'Visitor ID is required'; end if;

  select * into existing from public.wheel_spins
  where visitor_id = p_visitor_id or (current_user_id is not null and user_id = current_user_id)
  order by created_at asc limit 1;
  if found then
    return query select existing.id, existing.prize, existing.reward_code, true;
    return;
  end if;

  select value into configuration from public.store_settings where key = 'wheel_config';
  if coalesce((configuration->>'enabled')::boolean, false) is not true then
    raise exception 'The prize wheel is currently disabled';
  end if;
  slices := configuration->'slices';
  if pg_catalog.jsonb_typeof(slices) <> 'array' then raise exception 'Wheel slices are invalid'; end if;
  if pg_catalog.jsonb_array_length(slices) not between 2 and 12 then raise exception 'Wheel needs between 2 and 12 slices'; end if;

  select coalesce(sum((entry.slice->>'probability')::numeric), 0) into total_probability
  from pg_catalog.jsonb_array_elements(slices) as entry(slice);
  if pg_catalog.abs(total_probability - 100) > 0.01 then raise exception 'Wheel probabilities must total 100'; end if;

  roll_value := pg_catalog.random() * 100;
  for selected_slice in select entry.slice from pg_catalog.jsonb_array_elements(slices) as entry(slice)
  loop
    if coalesce(nullif(selected_slice->>'probability', '')::numeric, 0) <= 0
      or coalesce(selected_slice->>'label', '') = ''
      or coalesce(selected_slice->>'id', '') = '' then
      raise exception 'Wheel slice is invalid';
    end if;
    probability_cursor := probability_cursor + (selected_slice->>'probability')::numeric;
    if roll_value < probability_cursor then exit; end if;
    selected_slice := null;
  end loop;
  if selected_slice is null then raise exception 'Unable to select a wheel prize'; end if;

  reward_kind := selected_slice->>'rewardType';
  reward_amount := coalesce(nullif(selected_slice->>'rewardValue', '')::numeric, 0);
  if reward_kind not in ('discount', 'points', 'none') then raise exception 'Wheel reward type is invalid'; end if;
  if reward_kind = 'discount' and (reward_amount <= 0 or reward_amount > 100) then raise exception 'Wheel discount is invalid'; end if;
  if reward_kind = 'points' and (reward_amount < 1 or reward_amount <> pg_catalog.trunc(reward_amount)) then raise exception 'Wheel points reward is invalid'; end if;
  if reward_kind = 'none' then reward_amount := 0; end if;

  if reward_kind = 'discount' or (reward_kind = 'points' and current_user_id is null) then
    generated_code := 'MF-' || pg_catalog.upper(pg_catalog.encode(extensions.gen_random_bytes(12), 'hex'));
  end if;

  begin
    insert into public.wheel_spins (user_id, visitor_id, prize, reward_type, reward_value, reward_code)
    values (current_user_id, p_visitor_id, selected_slice, reward_kind, reward_amount, generated_code)
    returning id into created_spin_id;
  exception when unique_violation then
    select * into existing from public.wheel_spins
    where visitor_id = p_visitor_id or (current_user_id is not null and user_id = current_user_id)
    order by created_at asc limit 1;
    if found then
      return query select existing.id, existing.prize, existing.reward_code, true;
      return;
    end if;
    raise;
  end;

  if reward_kind = 'points' and current_user_id is not null then
    points_to_award := reward_amount::integer;
    insert into public.loyalty_accounts (user_id) values (current_user_id) on conflict (user_id) do nothing;
    insert into public.loyalty_ledger (user_id, delta_points, reason, idempotency_key)
    values (current_user_id, points_to_award, 'wheel_reward', 'wheel:' || created_spin_id);
    update public.loyalty_accounts set points_balance = points_balance + points_to_award, updated_at = pg_catalog.now()
    where user_id = current_user_id;
    update public.wheel_spins set points_claimed_by = current_user_id, points_claimed_at = pg_catalog.now()
    where id = created_spin_id;
  end if;

  return query select created_spin_id, selected_slice, generated_code, false;
end;
$$;
revoke all on function public.spin_wheel(uuid) from public;
grant execute on function public.spin_wheel(uuid) to anon, authenticated;

create or replace function public.claim_wheel_reward(p_visitor_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  spin public.wheel_spins%rowtype;
  changed_rows integer;
begin
  if auth.uid() is null then raise exception 'Sign in to claim points'; end if;
  select * into spin from public.wheel_spins where visitor_id = p_visitor_id for update;
  if not found or spin.reward_type <> 'points' or spin.points_claimed_at is not null then return 0; end if;
  if exists (select 1 from public.wheel_spins where user_id = auth.uid() and id <> spin.id) then return 0; end if;

  insert into public.loyalty_accounts (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  insert into public.loyalty_ledger (user_id, delta_points, reason, idempotency_key)
  values (auth.uid(), spin.reward_value::integer, 'wheel_reward', 'wheel:' || spin.id)
  on conflict (idempotency_key) do nothing;
  get diagnostics changed_rows = row_count;
  if changed_rows = 0 then return 0; end if;

  update public.loyalty_accounts set points_balance = points_balance + spin.reward_value::integer, updated_at = pg_catalog.now()
  where user_id = auth.uid();
  update public.wheel_spins set user_id = auth.uid(), points_claimed_by = auth.uid(), points_claimed_at = pg_catalog.now()
  where id = spin.id;
  return spin.reward_value::integer;
end;
$$;
revoke all on function public.claim_wheel_reward(uuid) from public;
grant execute on function public.claim_wheel_reward(uuid) to authenticated;

create or replace function public.validate_wheel_coupon(p_code text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select spins.reward_value
    from public.wheel_spins as spins
    where spins.reward_type = 'discount'
      and spins.redeemed_order_id is null
      and spins.reward_code = pg_catalog.upper(pg_catalog.btrim(coalesce(p_code, '')))
    limit 1
  ), 0);
$$;