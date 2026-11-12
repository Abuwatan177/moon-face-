import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(projectRoot, '.env') });
dotenv.config({ path: path.join(projectRoot, '.env.server') });

const PAGE_SIZE = 500;
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'store-media';
const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const primaryKeyColumns = {
  profiles: ['id'],
  store_settings: ['key'],
  orders: ['id'],
  product_likes: ['user_id', 'product_id'],
  product_saves: ['user_id', 'product_id'],
  product_comments: ['id'],
  store_feedback: ['id'],
  loyalty_accounts: ['user_id'],
  loyalty_ledger: ['id'],
  onesignal_push_subscriptions: ['subscription_id'],
  abandoned_cart_sessions: ['session_id'],
  push_subscriptions: ['endpoint_hash'],
  wheel_spins: ['id'],
};

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getConfiguration() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
  if (!supabaseUrl) throw new Error('Set SUPABASE_URL or VITE_SUPABASE_URL.');

  const endpoint = requiredEnv('R2_ENDPOINT');
  const publicUrl = requiredEnv('R2_PUBLIC_URL').replace(/\/+$/, '');
  const publicUrlObject = new URL(publicUrl);
  if (publicUrlObject.protocol !== 'https:') throw new Error('R2_PUBLIC_URL must use HTTPS.');
  if (new URL(endpoint).protocol !== 'https:') throw new Error('R2_ENDPOINT must use HTTPS.');
  requiredEnv('R2_ACCOUNT_ID');

  return {
    supabaseUrl,
    serviceRoleKey: requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    endpoint,
    bucket: requiredEnv('R2_BUCKET_NAME'),
    publicUrl,
    accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
  };
}

function imageContentType(object) {
  const type = object.metadata?.mimetype?.toLowerCase();
  if (type?.startsWith('image/')) return type;
  const extension = object.path.split('.').pop()?.toLowerCase();
  const types = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    avif: 'image/avif',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    heic: 'image/heic',
    heif: 'image/heif',
  };
  return types[extension] || null;
}

function normalizedStoragePath(value) {
  try {
    return value.split('/').map((segment) => decodeURIComponent(segment)).join('/');
  } catch {
    return null;
  }
}

export function publicImagePath(value, bucket, imagePaths) {
  if (typeof value !== 'string') return null;
  const rawPath = normalizedStoragePath(value.trim().replace(/^\/+/, ''));
  if (rawPath) {
    const directMatch = imagePaths.get(rawPath)
      || (rawPath.startsWith(`${bucket}/`) ? imagePaths.get(rawPath.slice(bucket.length + 1)) : null);
    if (directMatch) return directMatch;
  }

  let url;
  try {
    url = new URL(value, 'https://supabase-migration.invalid');
  } catch {
    return null;
  }
  const segments = url.pathname.split('/').filter(Boolean);
  const storageIndex = segments.findIndex((segment, index) => segment === 'storage' && segments[index + 1] === 'v1');
  if (storageIndex < 0) return null;

  const route = segments.slice(storageIndex + 2).map((segment) => {
    try { return decodeURIComponent(segment); } catch { return segment; }
  });
  let bucketIndex = -1;
  if (route[0] === 'object' && ['public', 'sign', 'authenticated'].includes(route[1])) {
    bucketIndex = storageIndex + 4;
  } else if (route[0] === 'render' && route[1] === 'image' && ['public', 'sign', 'authenticated'].includes(route[2])) {
    bucketIndex = storageIndex + 5;
  }
  const encodedBucket = segments[bucketIndex];
  if (!encodedBucket) return null;
  let actualBucket;
  try { actualBucket = decodeURIComponent(encodedBucket); } catch { return null; }
  if (actualBucket !== bucket) return null;

  const pathSegments = segments.slice(bucketIndex + 1);
  if (!pathSegments.length) return null;
  let objectPath;
  try {
    objectPath = pathSegments.map((segment) => decodeURIComponent(segment)).join('/');
  } catch {
    return null;
  }
  const normalizedPath = normalizedStoragePath(objectPath);
  if (!normalizedPath) return null;
  const exactPath = imagePaths.get(normalizedPath);
  if (exactPath) return exactPath;

  const webpPath = normalizedPath.replace(/\.(?:jpe?g|png|gif|avif|bmp|heic|heif|tiff?)$/i, '.webp');
  return imagePaths.get(webpPath) || (/\.(?:jpe?g|png|gif|webp|svg|avif|bmp|heic|heif|tiff?)$/i.test(normalizedPath) ? normalizedPath : null);
}

function publicR2Url(baseUrl, objectPath) {
  return `${baseUrl}/${objectPath.split('/').map(encodeURIComponent).join('/')}`;
}

function rewriteReferences(value, getReplacement) {
  if (typeof value === 'string') {
    const replacement = getReplacement(value);
    if (replacement) return replacement;
    if (/^\s*[\[{]/.test(value)) {
      try {
        const parsed = JSON.parse(value);
        const rewritten = rewriteReferences(parsed, getReplacement);
        if (JSON.stringify(rewritten) !== JSON.stringify(parsed)) return JSON.stringify(rewritten);
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => rewriteReferences(item, getReplacement));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteReferences(item, getReplacement)]));
  }
  return value;
}

async function listStorageImages(storage, bucket) {
  const images = [];
  async function walk(prefix = '') {
    let offset = 0;
    while (true) {
      const { data, error } = await storage.from(bucket).list(prefix, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw new Error(`Could not list Supabase Storage "${prefix || bucket}": ${error.message}`);
      for (const item of data || []) {
        if (!item.name || item.name === '.emptyFolderPlaceholder') continue;
        const objectPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id === null && item.metadata === null) await walk(objectPath);
        else {
          const object = { path: objectPath, metadata: item.metadata || {} };
          if (imageContentType(object)) images.push(object);
        }
      }
      if (!data || data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }
  await walk();
  return images;
}

async function readTableSchemas(supabaseUrl, serviceRoleKey) {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/openapi+json',
    },
  });
  if (!response.ok) throw new Error(`Could not discover Supabase tables (HTTP ${response.status}).`);

  const specification = await response.json();
  const definitions = specification.definitions || specification.components?.schemas || {};
  const tables = new Map();
  for (const [route, methods] of Object.entries(specification.paths || {})) {
    if (!methods?.get || route.startsWith('/rpc/')) continue;
    const name = decodeURIComponent(route.replace(/^\//, '').split('/')[0]);
    const properties = definitions[name]?.properties;
    if (!name) continue;
    if (!properties) throw new Error(`Could not read the schema for "${name}"; migration stopped before any changes.`);
    const columns = Object.keys(properties);
    const configuredKeys = primaryKeyColumns[name] || [];
    const keys = configuredKeys.length && configuredKeys.every((column) => properties[column])
      ? configuredKeys
      : [];
    if (columns.length) tables.set(name, { columns, keys });
  }
  if (!tables.has('store_settings')) throw new Error('store_settings is not exposed by Supabase OpenAPI; migration stopped.');
  return tables;
}

async function scanDatabase(supabase, tables, bucket, imagePaths, r2PublicUrl) {
  const plans = [];
  const missingPaths = new Set();
  let matchedReferences = 0;
  const replacementFor = (value) => {
    const objectPath = publicImagePath(value, bucket, imagePaths);
    if (!objectPath) return null;
    const storedPath = imagePaths.get(normalizedStoragePath(objectPath))
      || imagePaths.get(normalizedStoragePath(objectPath.replace(/\.(?:jpe?g|png|gif|avif|bmp|heic|heif|tiff?)$/i, '.webp')));
    if (!storedPath) {
      missingPaths.add(objectPath);
      return null;
    }
    matchedReferences += 1;
    return publicR2Url(r2PublicUrl, storedPath);
  };

  for (const [table, { columns, keys }] of tables) {
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.from(table).select(columns.join(',')).range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(`Could not scan "${table}" at offset ${offset}: ${error.message}`);
      const tableMatchesBefore = matchedReferences;
      for (const row of data || []) {
        const updates = {};
        for (const column of columns) {
          const nextValue = rewriteReferences(row[column], replacementFor);
          if (JSON.stringify(nextValue) !== JSON.stringify(row[column])) updates[column] = nextValue;
        }
        if (!Object.keys(updates).length) continue;
        if (!keys.length) {
          throw new Error(`Found image URL references in "${table}", but its primary key is not configured in this migration script.`);
        }
        const keyValues = Object.fromEntries(keys.map((key) => [key, row[key]]));
        if (Object.values(keyValues).some((value) => value === null || value === undefined)) {
          throw new Error(`Found an image URL in "${table}" without a usable primary-key value.`);
        }
        plans.push({ table, keys, keyValues, updates });
      }
      if (matchedReferences > tableMatchesBefore) {
        console.log(`  found ${matchedReferences - tableMatchesBefore} storage reference(s) in "${table}"`);
      }
      if (!data || data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }
  if (missingPaths.size) throw new Error(`Database references ${missingPaths.size} image(s) missing from Supabase Storage; no database rows were changed.`);
  return plans;
}

async function verifyUpdateTargets(supabase, plans) {
  for (const plan of plans) {
    const { data, error } = await supabase.from(plan.table)
      .select(plan.keys.join(','))
      .match(plan.keyValues)
      .limit(2);
    if (error) throw new Error(`Could not verify the update target in "${plan.table}": ${error.message}`);
    if (data?.length !== 1) {
      throw new Error(`Expected exactly one update target in "${plan.table}", found ${data?.length || 0}; no database rows were changed.`);
    }
  }
}

async function uploadImages(storage, r2Client, images, bucket, r2Bucket) {
  for (const image of images) {
    const { data, error } = await storage.from(bucket).download(image.path);
    if (error) throw new Error(`Could not download "${image.path}" from Supabase: ${error.message}`);
    const body = Buffer.from(await data.arrayBuffer());
    const contentType = imageContentType(image);
    await r2Client.send(new PutObjectCommand({
      Bucket: r2Bucket,
      Key: image.path,
      Body: body,
      ContentLength: body.byteLength,
      ContentType: contentType,
      CacheControl: CACHE_CONTROL,
    }));
    console.log(`uploaded: ${image.path}`);
  }
}

async function applyDatabaseUpdates(supabase, plans) {
  for (const plan of plans) {
    const { data, error } = await supabase.from(plan.table)
      .update(plan.updates)
      .match(plan.keyValues)
      .select(plan.keys.join(','))
      .limit(2);
    if (error) throw new Error(`Could not update image URLs in "${plan.table}": ${error.message}`);
    if (data?.length !== 1) {
      throw new Error(`Expected to update exactly one row in "${plan.table}", updated ${data?.length || 0}.`);
    }
    console.log(`updated: ${plan.table}`);
  }
}

async function main() {
  const config = getConfiguration();
  const apply = process.argv.includes('--apply');
  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const r2Client = new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });

  const images = await listStorageImages(supabase.storage, STORAGE_BUCKET);
  const imagePaths = new Map(images.map((image) => [normalizedStoragePath(image.path), image.path]));
  const tables = await readTableSchemas(config.supabaseUrl, config.serviceRoleKey);
  const plans = await scanDatabase(supabase, tables, STORAGE_BUCKET, imagePaths, config.publicUrl);
  await verifyUpdateTargets(supabase, plans);

  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${images.length} Supabase Storage image(s), ${plans.length} database row(s) to update.`);
  if (!apply) {
    console.log('No files or database rows were changed. Re-run with --apply to upload images and update database URLs.');
    return;
  }

  await uploadImages(supabase.storage, r2Client, images, STORAGE_BUCKET, config.bucket);
  await applyDatabaseUpdates(supabase, plans);
  console.log('Migration complete. Supabase Storage files were left untouched.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
