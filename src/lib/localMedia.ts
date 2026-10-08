const databaseName = 'moon-face-local-media';
const storeName = 'assets';
const localMediaPrefix = 'local-media:';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local media storage'));
  });
}

export async function saveLocalMedia(blob: Blob, tryLosslessCompression = false): Promise<string> {
  const id = crypto.randomUUID();
  let storedBlob = blob;
  let compressed = false;
  if (tryLosslessCompression && 'CompressionStream' in globalThis) {
    const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
    const candidate = await new Response(stream).blob();
    if (candidate.size < blob.size) {
      storedBlob = candidate;
      compressed = true;
    }
  }
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put({ id, blob: storedBlob, compressed, type: blob.type });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not save local media'));
    transaction.onabort = () => reject(transaction.error || new Error('Local media save was cancelled'));
  });
  database.close();
  return `${localMediaPrefix}${id}`;
}

export async function loadLocalMedia(source: string): Promise<Blob | null> {
  if (!source.startsWith(localMediaPrefix)) return null;
  const id = source.slice(localMediaPrefix.length);
  const database = await openDatabase();
  const result = await new Promise<{ blob: Blob; compressed: boolean; type: string } | null>((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Could not load local media'));
  });
  database.close();
  if (!result) return null;
  if (!result.compressed) return result.blob as Blob;
  const stream = result.blob.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream, { headers: { 'Content-Type': result.type } }).blob();
}

export async function deleteLocalMedia(source: string) {
  if (!source.startsWith(localMediaPrefix)) return;
  const id = source.slice(localMediaPrefix.length);
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not delete local media'));
  });
  database.close();
}
