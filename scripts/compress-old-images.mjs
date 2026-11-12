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
const MAX_OUTPUT_BYTES = 180 * 1024;
const PAGE_SIZE = 1000;
const dryRun = process.argv.includes('--dry-run');
const cleanupEnabled = process.argv.includes('--cleanup');
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (or .env.server).');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

function collectStorageReferences(value, paths = new Set()) {
  if (typeof value === 'string') {
    const objectPath = storagePathFromUrl(value);
    if (objectPath) {
      paths.add(objectPath);
      const extension = path.posix.extname(objectPath);
      if (/\.(?:jpe?g|png|gif|svg|avif|bmp|heic|heif|tiff?)$/i.test(extension)) {
        paths.add(objectPath.slice(0, -extension.length) + '.webp');
      }
    }
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectStorageReferences(item, paths));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectStorageReferences(item, paths));
  }
  return paths;
}

async function smartCompressBuffer(input) {
  const attempts = [
    { width: 1000, quality: 78 },
    { width: 1000, quality: 68 },
    { width: 850, quality: 62 },
  ];
  let output;
  for (const attempt of attempts) {
    output = await sharp(input, { failOn: 'error' })
      .rotate()
      .resize({ width: attempt.width, height: attempt.width, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: attempt.quality, effort: 4 })
      .toBuffer();
    if (output.byteLength <= MAX_OUTPUT_BYTES) return output;
  }
  return output;
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
    cacheControl: '86400',
    upsert: true,
  });
  if (error) throw new Error(`Upload failed for ${objectPath}: ${error.message}`);
}

async function discoverReadableTables() {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/openapi+json',
    },
  });
  if (!response.ok) throw new Error(`Could not discover Supabase tables: HTTP ${response.status}`);

  const specification = await response.json();
  const tableNames = new Set();
  for (const [route, methods] of Object.entries(specification.paths || {})) {
    if (!methods?.get || route.startsWith('/rpc/')) continue;
    const tableName = decodeURIComponent(route.replace(/^\//, '').split('/')[0]);
    if (tableName) tableNames.add(tableName);
  }
  if (!tableNames.size) throw new Error('Supabase OpenAPI returned no readable tables; cleanup is disabled.');
  if (!tableNames.has('store_settings')) throw new Error('store_settings is not exposed by Supabase OpenAPI; cleanup is disabled.');

  const tables = [];
  for (const tableName of tableNames) {
    const properties = specification.definitions?.[tableName]?.properties;
    if (!properties) throw new Error(`Could not read the column schema for "${tableName}"; cleanup is disabled.`);
    const columns = Object.entries(properties)
      .filter(([, property]) => {
        const types = Array.isArray(property.type) ? property.type : [property.type];
        return types.some((type) => ['string', 'object', 'array'].includes(type))
          && !['date', 'date-time', 'time'].includes(property.format);
      })
      .map(([column]) => `"${column.replace(/"/g, '""')}"`);
    if (columns.length) tables.push({ name: tableName, columns: columns.join(',') });
  }
  return tables;
}

async function readDatabaseImageReferences() {
  const tables = await discoverReadableTables();
  const references = new Set();

  for (const { name: table, columns } of tables) {
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.from(table).select(columns).range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(`Could not scan table "${table}" at offset ${offset}; cleanup is disabled: ${error.message}`);
      for (const row of data || []) collectStorageReferences(row, references);
      if (!data || data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    console.log(`  scanned table: ${table}`);
  }

  return { references, tablesScanned: tables.length };
}

function isImageFile(file) {
  return file.metadata?.mimetype?.startsWith('image/')
    || /\.(?:jpe?g|png|gif|webp|svg|avif|bmp|heic|heif|tiff?)$/i.test(file.path);
}

async function listStorageImages() {
  const files = [];
  const walk = async (prefix = '') => {
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.storage.from(BUCKET_NAME).list(prefix, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw new Error(`Could not list storage folder "${prefix || '/'}": ${error.message}`);

      for (const item of data || []) {
        if (!item.name || item.name === '.emptyFolderPlaceholder') continue;
        const objectPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id === null && item.metadata === null) await walk(objectPath);
        else {
          const file = { path: objectPath, size: Number(item.metadata?.size), metadata: item.metadata || {} };
          if (isImageFile(file)) files.push(file);
        }
      }

      if (!data || data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  };
  await walk();
  return files;
}

async function main() {
  const files = await listStorageImages();
  console.log(`${dryRun ? 'DRY RUN' : 'APPLY'}: ${files.length} image file(s) in bucket "${BUCKET_NAME}".`);

  let referenceScan = null;
  try {
    referenceScan = await readDatabaseImageReferences();
    console.log(`Verified image references across ${referenceScan.tablesScanned} readable table(s).`);
  } catch (error) {
    console.error(`Database reference scan failed; orphan cleanup is disabled: ${error instanceof Error ? error.message : String(error)}`);
  }

  let compressedCount = 0;
  let missing = 0;
  let smallFiles = 0;
  let failed = 0;

  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const file = files[fileIndex];
    if (Number.isFinite(file.size) && file.size <= MAX_OUTPUT_BYTES) {
      smallFiles += 1;
      continue;
    }

    try {
      const publicUrl = supabase.storage.from(BUCKET_NAME).getPublicUrl(file.path).data.publicUrl;
      const original = await downloadImage(publicUrl, file.path);
      if (!original) {
        missing += 1;
        continue;
      }
      if (original.byteLength <= MAX_OUTPUT_BYTES) {
        smallFiles += 1;
        continue;
      }

      const compressed = await smartCompressBuffer(original);
      if (compressed.byteLength > MAX_OUTPUT_BYTES) {
        failed += 1;
        console.error(`  still exceeds 180KB after three passes; left unchanged: ${file.path} (${compressed.byteLength} bytes)`);
        continue;
      }
      if (dryRun) {
        compressedCount += 1;
        console.log(`  would compress: ${file.path} (${original.byteLength} -> ${compressed.byteLength} bytes)`);
        continue;
      }

      await overwriteWebp(file.path, compressed);
      compressedCount += 1;
      console.log(`  compressed: ${file.path} (${original.byteLength} -> ${compressed.byteLength} bytes)`);
    } catch (error) {
      failed += 1;
      console.error(`  compression failed; original unchanged: ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let orphanedFiles = [];
  if (referenceScan) {
    orphanedFiles = files.filter((file) => !referenceScan.references.has(file.path));
    for (const file of orphanedFiles) {
      const sizeText = Number.isFinite(file.size) ? `${file.size} bytes` : 'size unknown';
      if (dryRun || cleanupEnabled) console.log(`  ${cleanupEnabled && !dryRun ? 'orphan to delete' : 'orphan preview'}: ${file.path} (${sizeText})`);
    }

    if (cleanupEnabled && !dryRun && orphanedFiles.length) {
      for (let start = 0; start < orphanedFiles.length; start += 100) {
        const batch = orphanedFiles.slice(start, start + 100).map((file) => file.path);
        const { error } = await supabase.storage.from(BUCKET_NAME).remove(batch);
        if (error) {
          failed += batch.length;
          console.error(`Could not delete orphan batch; all originals retained: ${error.message}`);
        } else {
          console.log(`Deleted ${batch.length} confirmed orphan image(s).`);
        }
      }
    } else if (cleanupEnabled && dryRun) {
      console.log('Cleanup is in dry-run mode; no files were deleted.');
    } else if (cleanupEnabled && !orphanedFiles.length) {
      console.log('No orphan images found.');
    }
  } else if (cleanupEnabled) {
    console.error('Cleanup skipped because the complete database reference scan did not succeed.');
    failed += 1;
  }

  console.log(`Finished: ${compressedCount} compressed, ${smallFiles} already <=180KB, ${orphanedFiles.length} orphan(s)${cleanupEnabled && !dryRun && referenceScan ? ' processed for cleanup' : ''}, ${missing} missing, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});