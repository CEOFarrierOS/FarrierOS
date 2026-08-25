import { emptyData } from "./emptyData";
import { sampleData } from "./sampleData";
import { AppData } from "./types";

const LEGACY_STORAGE_KEY = "farrieros-prototype-0";
const DB_NAME = "farrieros";
const DB_VERSION = 1;
const STORE_NAME = "app-state";
const DATA_KEY = "current";

function mergeWithDefaults(saved: AppData): AppData {
  return {
    ...emptyData,
    ...saved,
    business: { ...emptyData.business, ...saved.business },
    membership: saved.membership ?? emptyData.membership,
    collaborationMembers: saved.collaborationMembers ?? [],
    activityPings: saved.activityPings ?? [],
    clients: saved.clients ?? [],
    barns: saved.barns ?? [],
    horses: saved.horses ?? [],
    footRecords: saved.footRecords ?? [],
    shoeSetups: saved.shoeSetups ?? [],
    serviceRecords: saved.serviceRecords ?? [],
    appointments: saved.appointments ?? [],
    photos: saved.photos ?? [],
    preferences: { ...emptyData.preferences!, ...(saved.preferences ?? {}) },
    expenses: saved.expenses ?? [],
  };
}

function removeBundledDemoData(saved: AppData): AppData {
  const clean = mergeWithDefaults(saved);
  const removeSeedIds = <T extends { id: string }>(items: T[], seeds: T[]) => {
    const seedIds = new Set(seeds.map((item) => item.id));
    return items.filter((item) => !seedIds.has(item.id));
  };

  return {
    ...clean,
    business: clean.business.id === sampleData.business.id ? emptyData.business : clean.business,
    collaborationMembers: removeSeedIds(clean.collaborationMembers, sampleData.collaborationMembers),
    activityPings: removeSeedIds(clean.activityPings, sampleData.activityPings),
    clients: removeSeedIds(clean.clients, sampleData.clients),
    barns: removeSeedIds(clean.barns, sampleData.barns),
    horses: removeSeedIds(clean.horses, sampleData.horses),
    footRecords: removeSeedIds(clean.footRecords, sampleData.footRecords),
    shoeSetups: removeSeedIds(clean.shoeSetups, sampleData.shoeSetups),
    serviceRecords: removeSeedIds(clean.serviceRecords, sampleData.serviceRecords),
    appointments: removeSeedIds(clean.appointments, sampleData.appointments),
    photos: removeSeedIds(clean.photos, sampleData.photos),
    expenses: clean.expenses ?? [],
  };
}

function readLegacyData(): AppData | null {
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return null;
  try {
    return removeBundledDemoData(JSON.parse(raw) as AppData);
  } catch {
    return null;
  }
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readIndexedData() {
  const db = await openDatabase();
  return new Promise<AppData | null>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(DATA_KEY);
    request.onsuccess = () => resolve(request.result ? removeBundledDemoData(request.result as AppData) : null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export function loadInitialData() {
  return readLegacyData() ?? emptyData;
}

export async function hydrateData() {
  try {
    const indexed = await readIndexedData();
    if (indexed) return indexed;
    const legacy = readLegacyData();
    const initial = legacy ?? emptyData;
    await saveData(initial);
    if (legacy) localStorage.removeItem(LEGACY_STORAGE_KEY);
    return initial;
  } catch {
    return readLegacyData() ?? emptyData;
  }
}

export async function saveData(data: AppData) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(data, DATA_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export async function resetData() {
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(DATA_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
  await saveData(emptyData);
  return emptyData;
}

export function createBackup(data: AppData) {
  return JSON.stringify(
    { format: "farrieros-backup", version: 1, exportedAt: new Date().toISOString(), data },
    null,
    2,
  );
}

export function parseBackup(raw: string) {
  const parsed = JSON.parse(raw) as { format?: string; data?: AppData };
  if (parsed.format !== "farrieros-backup" || !parsed.data?.business || !Array.isArray(parsed.data.horses)) {
    throw new Error("This file is not a valid FarrierOS backup.");
  }
  return mergeWithDefaults(parsed.data);
}
