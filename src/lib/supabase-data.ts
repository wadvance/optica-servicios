import { supabase } from "./supabase";
import type { InventoryItem, PurchaseOrder, ServicePayment, Customer, Invoice, Appointment, UserAccount } from "../App";

function getLocal<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function setLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private browsing */
  }
}

// --- Auto-backup: guarda hasta 10 snapshots por cada key de datos ---

const BACKUP_KEY = "sop-backups";
const MAX_BACKUPS_PER_KEY = 10;

type BackupEntry = { data: unknown; timestamp: string };

function takeBackup(localKey: string, data: unknown) {
  try {
    const all = JSON.parse(localStorage.getItem(BACKUP_KEY) || "{}") as Record<string, BackupEntry[]>;
    const entries = all[localKey] || [];
    entries.push({ data, timestamp: new Date().toISOString() });
    if (entries.length > MAX_BACKUPS_PER_KEY) entries.shift();
    all[localKey] = entries;
    localStorage.setItem(BACKUP_KEY, JSON.stringify(all));
  } catch {
    /* private browsing */
  }
}

export function getBackups(localKey: string): BackupEntry[] {
  try {
    const all = JSON.parse(localStorage.getItem(BACKUP_KEY) || "{}") as Record<string, BackupEntry[]>;
    return all[localKey] || [];
  } catch {
    return [];
  }
}

export function restoreFromBackup(localKey: string, backupIndex = 0): unknown | null {
  const backups = getBackups(localKey);
  if (backups.length <= backupIndex) return null;
  const entry = backups[backupIndex];
  setLocal(localKey, entry.data);
  return entry.data;
}

// --- Data loading from Supabase with localStorage fallback ---

async function loadTable<T extends { id: string }>(table: string, localKey: string, seed: T[]): Promise<T[]> {
  const localData = getLocal<T[]>(localKey, seed);

  // Backup antes de cualquier posible modificacion
  if (localData.length > 0) takeBackup(localKey, localData);

  try {
    const { data, error } = await supabase.from(table).select("*");
    if (error) throw error;

    const remoteData = (data && data.length > 0 ? mapFromSupabase(table, data) : []) as T[];

    // Merge: prefer local data (most recent), add remote records not in local
    const mergedMap = new Map<string, T>();
    for (const item of localData) mergedMap.set(item.id, item);
    for (const item of remoteData) {
      if (!mergedMap.has(item.id)) mergedMap.set(item.id, item);
    }
    const merged = Array.from(mergedMap.values());

    setLocal(localKey, merged);

    // If local has records missing from remote, push them up
    if (localData.length > remoteData.length) {
      const payload = localData.map((item) => mapToSupabase(table, item as unknown as Record<string, unknown>));
      supabase.from(table).upsert(payload, { onConflict: "id" }).catch(() => {});
    }

    return merged;
  } catch {
    // Offline or unavailable - fall back to local
  }

  return localData;
}

function mapFromSupabase(table: string, rows: Record<string, unknown>[]): unknown[] {
  return rows.map((r) => {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(r)) {
      const jsKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      mapped[jsKey] = value;
    }
    if (table === "inventory_items" && mapped.minStock !== undefined) {
      (mapped as Record<string, unknown>).minStock = mapped.minStock;
    }
    if (table === "invoice_lines" && mapped.invoiceId !== undefined) {
      delete mapped.invoiceId;
    }
    return mapped;
  });
}

function mapToSupabase(table: string, data: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const dbKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
    mapped[dbKey] = value;
  }
  if (table === "inventory_items" && mapped.min_stock !== undefined) {
    mapped.min_stock = mapped.min_stock;
  }
  return mapped;
}

async function upsertTable<T extends Record<string, unknown>>(table: string, data: T[], localKey: string) {
  // Backup antes de sobrescribir
  const prev = getLocal<unknown>(localKey, null);
  if (prev) takeBackup(localKey, prev);

  setLocal(localKey, data);
  try {
    const payload = data.map((item) => mapToSupabase(table, item));
    await supabase.from(table).upsert(payload, { onConflict: "id" });
  } catch {
    console.warn(`[Sync] Fallo al sincronizar ${table} con Supabase — los datos solo estan en localStorage`);
  }
}

// --- App-specific data loaders ---

export async function loadAllSeedData(): Promise<{
  inventory: InventoryItem[];
  purchases: PurchaseOrder[];
  servicePayments: ServicePayment[];
  customers: Customer[];
  invoices: Invoice[];
  appointments: Appointment[];
  users: UserAccount[];
}> {
  const [inventory, purchases, servicePayments, customers, invoices, appointments, users] = await Promise.all([
    loadTable<InventoryItem>("inventory_items", "sop-inventory", []),
    loadTable<PurchaseOrder>("purchase_orders", "sop-purchases", []),
    loadTable<ServicePayment>("service_payments", "sop-service-payments", []),
    loadTable<Customer>("customers", "sop-customers", []),
    loadTable<Invoice>("invoices", "sop-invoices", []),
    loadTable<Appointment>("appointments", "sop-appointments", []),
    loadTable<UserAccount>("user_accounts", "sop-users", []),
  ]);

  return { inventory, purchases, servicePayments, customers, invoices, appointments, users };
}

// --- Upsert helpers ---

export async function saveInventory(items: InventoryItem[]) {
  await upsertTable("inventory_items", items as unknown as Record<string, unknown>[], "sop-inventory");
}

export async function savePurchases(items: PurchaseOrder[]) {
  await upsertTable("purchase_orders", items as unknown as Record<string, unknown>[], "sop-purchases");
}

export async function saveServicePayments(items: ServicePayment[]) {
  await upsertTable("service_payments", items as unknown as Record<string, unknown>[], "sop-service-payments");
}

export async function saveCustomers(items: Customer[]) {
  await upsertTable("customers", items as unknown as Record<string, unknown>[], "sop-customers");
}

export async function saveInvoices(items: Invoice[]) {
  await upsertTable("invoices", items as unknown as Record<string, unknown>[], "sop-invoices");
}

export async function saveAppointments(items: Appointment[]) {
  await upsertTable("appointments", items as unknown as Record<string, unknown>[], "sop-appointments");
}

export async function saveUserAccounts(items: UserAccount[]) {
  await upsertTable("user_accounts", items as unknown as Record<string, unknown>[], "sop-users");
}
