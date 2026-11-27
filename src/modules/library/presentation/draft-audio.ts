type DraftRecording = { id: string; tab: string; name: string; file: File; expires: number };
const lifetime = 24 * 60 * 60 * 1000;

async function recordings<T>(operation: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("lexora-editor-audio", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("recordings", { keyPath: "id" }).createIndex("tab", "tab");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("recordings", "readwrite");
      const store = transaction.objectStore("recordings");
      const request = operation(store);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
export async function rememberDraftAudio(tab: string, file: File) {
  await recordings((store) =>
    store.put({
      id: tab + ":" + file.name,
      tab,
      name: file.name,
      file,
      expires: Date.now() + lifetime,
    } satisfies DraftRecording),
  );
}
export async function recoverDraftAudio(tab: string): Promise<File[]> {
  const saved: DraftRecording[] = await recordings((store) => store.index("tab").getAll(tab));
  return saved.filter((r) => r.expires > Date.now()).map((r) => r.file);
}
export async function clearDraftAudio(tab: string) {
  await recordings((store) => {
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const row = cursor.result;
      if (!row) return;
      const entry: DraftRecording = row.value;
      if (entry.tab === tab || entry.expires < Date.now()) row.delete();
      row.continue();
    };
    return cursor;
  });
}
