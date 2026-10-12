import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { pathToFileURL } from 'node:url';

const PAGE_SIZE = 100;
const BATCH_SIZE = 2;
const SUPPORTED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const SUPPORTED_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

export async function compressImageBuffer(input) {
  const source = sharp(input, { failOn: 'none' });
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height || !SUPPORTED_FORMATS.has(metadata.format) || (metadata.pages ?? 1) > 1) {
    return { buffer: null, reason: 'unsupported' };
  }

  const output = sharp(input, { failOn: 'none' }).keepMetadata();
  if (metadata.format === 'jpeg') output.jpeg({ quality: 88, mozjpeg: true });
  if (metadata.format === 'png') output.png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 });
  if (metadata.format === 'webp') output.webp({ quality: 88, effort: 6 });

  const { data, info } = await output.toBuffer({ resolveWithObject: true });
  if (info.width !== metadata.width || info.height !== metadata.height) {
    throw new Error(`Unexpected dimensions after compression: ${metadata.width}x${metadata.height} -> ${info.width}x${info.height}`);
  }
  if (data.byteLength >= input.byteLength) return { buffer: null, reason: 'not-smaller' };

  return { buffer: data, format: metadata.format, width: info.width, height: info.height };
}

async function listImages(storage, bucket, prefix = '') {
  const paths = [];
  let offset = 0;

  while (true) {
    const { data, error } = await storage.from(bucket).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`Could not list ${prefix || bucket}: ${error.message}`);

    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null && item.metadata === null) {
        paths.push(...await listImages(storage, bucket, path));
      } else if (item.metadata?.mimetype?.startsWith('image/') || SUPPORTED_EXTENSIONS.test(item.name)) {
        paths.push(path);
      }
    }

    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return paths;
}

async function processImage(storage, bucket, path, apply) {
  const { data, error } = await storage.from(bucket).download(path);
  if (error) throw new Error(`Download failed: ${error.message}`);

  const original = Buffer.from(await data.arrayBuffer());
  const result = await compressImageBuffer(original);
  if (!result.buffer) return { status: result.reason };

  const savedBytes = original.byteLength - result.buffer.byteLength;
  if (!apply) return { status: 'would-update', savedBytes };

  const contentType = result.format === 'jpeg' ? 'image/jpeg' : `image/${result.format}`;
  const { error: uploadError } = await storage.from(bucket).upload(path, result.buffer, {
    contentType,
    upsert: true,
    cacheControl: '3600',
  });
  if (uploadError) throw new Error(`Overwrite failed: ${uploadError.message}`);

  return { status: 'updated', savedBytes };
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'store-media';
  const apply = process.argv.includes('--apply');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.server before running this script.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const storage = supabase.storage;
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: bucket "${bucket}"; batch size ${BATCH_SIZE}.`);
  if (!apply) console.log('No files will be changed. Add --apply to overwrite smaller compressed images.');

  const paths = await listImages(storage, bucket);
  console.log(`Found ${paths.length} candidate image(s).`);

  const totals = { updated: 0, wouldUpdate: 0, unchanged: 0, unsupported: 0, failed: 0, savedBytes: 0 };
  for (let start = 0; start < paths.length; start += BATCH_SIZE) {
    const batch = paths.slice(start, start + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (path) => {
      try {
        const result = await processImage(storage, bucket, path, apply);
        if (result.status === 'updated') totals.updated += 1;
        else if (result.status === 'would-update') totals.wouldUpdate += 1;
        else if (result.status === 'unsupported') totals.unsupported += 1;
        else totals.unchanged += 1;
        totals.savedBytes += result.savedBytes ?? 0;
        console.log(`${result.status}: ${path}${result.savedBytes ? ` (saving ${(result.savedBytes / 1024).toFixed(1)} KB)` : ''}`);
      } catch (error) {
        totals.failed += 1;
        console.error(`failed: ${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));
    await Promise.all(results);
  }

  console.log(`Finished: ${totals.updated} updated, ${totals.wouldUpdate} eligible, ${totals.unchanged} unchanged, ${totals.unsupported} unsupported, ${totals.failed} failed.`);
  console.log(`Total potential bytes saved: ${(totals.savedBytes / 1024 / 1024).toFixed(2)} MB.`);
  if (totals.failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}