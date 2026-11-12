import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(projectRoot, '.env');
dotenv.config({ path: existsSync(envPath) ? envPath : path.join(projectRoot, '.env.server') });

const BUCKET_NAME = 'store-media';
const PRODUCTS_KEY = 'products';
const MAX_DIMENSION = 1000;
const MAX_OUTPUT_BYTES = 180 * 1024;
const dryRun = process.argv.includes('--dry-run');
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (or .env.server).');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function imageSource(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  if (typeof value.finalUrl === 'string' && value.finalUrl) return value.finalUrl;
  return typeof value.previewUrl === 'string' ? value.previewUrl : '';
}

function isImageSourceField(key, parent) {
  return key === 'image' || key === 'img' || key === 'images' || (key === 'url' && parent?.type === 'image');
}

function collectProductImageSources(product) {
  const sources = new Set();
  const visit = (value, key = '', parent = null) => {
    if (isImageSourceField(key, parent)) {
      const source = imageSource(value);
      if (source && !source.startsWith('blob:')) sources.add(source);
      if (source) return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key, parent));
    } else if (value && typeof value === 'object') {
      Object.entries(value).forEach(([childKey, child]) => visit(child, childKey, value));
    }
  };
  visit(product);
  return [...sources];
}

function storagePathFromUrl(source) {
  try {
    const pathname = new URL(source).pathname;
    const objectMarkerIndex = pathname.indexOf('/storage/v1/object/');
    const bucketMarker = `/${BUCKET_NAME}/`;
    const bucketMarkerIndex = pathname.indexOf(bucketMarker, objectMarkerIndex);
    if (objectMarkerIndex < 0 || bucketMarkerIndex < 0) return null;
    const access = pathname.slice(objectMarkerIndex + '/storage/v1/object/'.length, bucketMarkerIndex);
    if (!['public', 'sign', 'authenticated'].includes(access)) return null;
    const encodedPath = pathname.slice(bucketMarkerIndex + bucketMarker.length);
    return encodedPath ? decodeURIComponent(encodedPath) : null;
  } catch {
    return null;
  }
}

async function smartCompressBuffer(input) {
  const createOutput = (quality) => sharp(input, { failOn: 'error' })
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer();

  const firstPass = await createOutput(78);
  if (firstPass.byteLength <= MAX_OUTPUT_BYTES) return firstPass;
  return createOutput(68);
}

async function downloadImage(source, objectPath) {
  try {
    const response = await fetch(source);
    if (!response.ok) {
      console.warn(`  image not found, skipped: ${objectPath}`);
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch {
    console.warn(`  image not found, skipped: ${objectPath}`);
    return null;
  }
}

async function overwriteWebp(objectPath, input) {
  const { error } = await supabase.storage.from(BUCKET_NAME).upload(objectPath, input, {
    contentType: 'image/webp',
    cacheControl: '3600',
    upsert: true,
  });
  if (error) throw new Error(`Upload failed for ${objectPath}: ${error.message}`);
}

async function readProductCatalog() {
  const { data, error } = await supabase.from('store_settings')
    .select('value')
    .eq('key', PRODUCTS_KEY)
    .maybeSingle();
  if (error) throw new Error(`Could not read the product catalog: ${error.message}`);
  if (!Array.isArray(data?.value)) throw new Error('store_settings key "products" is missing or is not an array.');
  return data.value;
}

async function main() {
  const catalog = await readProductCatalog();
  const processedPaths = new Set();
  let compressedCount = 0;
  let skipped = 0;
  let missing = 0;
  let failed = 0;

  console.log(`${dryRun ? 'DRY RUN' : 'APPLY'}: ${catalog.length} product(s), bucket "${BUCKET_NAME}".`);
  if (dryRun) console.log('No storage files will be overwritten.');

  for (let productIndex = 0; productIndex < catalog.length; productIndex += 1) {
    const product = catalog[productIndex];
    const sources = collectProductImageSources(product);
    console.log(`[${productIndex + 1}/${catalog.length}] ${product.nameAr || product.name || product.id}: ${sources.length} image source(s)`);

    for (const source of sources) {
      const databasePath = storagePathFromUrl(source);
      if (!databasePath) {
        console.warn('  image not found, skipped: invalid storage URL');
        missing += 1;
        continue;
      }

      const extension = path.posix.extname(databasePath);
      const objectPath = extension.toLowerCase() === '.webp'
        ? databasePath
        : /\.(?:jpe?g|png|gif|svg|avif|bmp|heic|heif|tiff?)$/i.test(databasePath)
          ? databasePath.slice(0, -extension.length) + '.webp'
          : null;
      if (!objectPath) {
        skipped += 1;
        continue;
      }
      if (processedPaths.has(objectPath)) continue;
      processedPaths.add(objectPath);
      const downloadUrl = objectPath === databasePath
        ? source
        : supabase.storage.from(BUCKET_NAME).getPublicUrl(objectPath).data.publicUrl;

      try {
        const original = await downloadImage(downloadUrl, objectPath);
        if (!original) {
          missing += 1;
          continue;
        }
        if (original.byteLength <= MAX_OUTPUT_BYTES) {
          skipped += 1;
          continue;
        }

        const compressed = await smartCompressBuffer(original);
        if (dryRun) {
          compressedCount += 1;
          console.log(`  would overwrite: ${objectPath} (${original.byteLength} -> ${compressed.byteLength} bytes)`);
          continue;
        }

        await overwriteWebp(objectPath, compressed);
        compressedCount += 1;
        console.log(`  compressed in place: ${objectPath} (${original.byteLength} -> ${compressed.byteLength} bytes)`);
      } catch (error) {
        failed += 1;
        console.error(`  image failed; original unchanged: ${objectPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  console.log(`Finished: ${compressedCount} compressed, ${skipped} already small or unsupported, ${missing} missing, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});