import type {
  User, Category, Ingredient, InventoryItem,
  InventoryCreate, InventoryUpdate, SystemStatus
} from './types';

const BASE = import.meta.env.VITE_API_BASE ?? 'https://smartfridge-f6b6.onrender.com/api/v1';

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (res.status === 503 && !retried) {
    await fetch(`${BASE}/system/wake`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    return request<T>(path, init, true);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.detail || err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// Users
export const getUsers = () => request<User[]>('/users');
export const getUserById = (id: string) => request<User>(`/users/${id}`);
export const createUser = (data: { username: string; user_id?: string }) =>
  request<User>('/users', { method: 'POST', body: JSON.stringify(data) });

// Categories
export const getCategories = () => request<Category[]>('/categories');

// Ingredients
export const getIngredients = (category_id?: number) =>
  request<Ingredient[]>(`/ingredients${category_id != null ? `?category_id=${category_id}` : ''}`);

export const searchIngredients = (keyword: string) =>
  request<Ingredient[]>(`/ingredients/search/${encodeURIComponent(keyword)}`);

export const createIngredient = (data: { name: string; category_id?: number }) =>
  request<Ingredient>('/ingredients', { method: 'POST', body: JSON.stringify(data) });

export const updateIngredient = (id: number, data: { category_id?: number }) =>
  request<Ingredient>(`/ingredients/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// Inventory
export const getInventory = (user_id: string) =>
  request<InventoryItem[]>(`/inventory?user_id=${user_id}`);

export const searchInventory = (user_id: string, keyword: string) =>
  request<{ source: string; data: InventoryItem[] | Ingredient[]; message?: string }>(
    `/inventory/search?user_id=${user_id}&keyword=${encodeURIComponent(keyword)}`
  );

export const createInventory = (data: InventoryCreate) =>
  request<InventoryItem>('/inventory', { method: 'POST', body: JSON.stringify(data) });

export const updateInventory = (id: number, data: InventoryUpdate) =>
  request<InventoryItem>(`/inventory/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteInventory = (id: number) =>
  request<{ message: string }>(`/inventory/${id}`, { method: 'DELETE' });

// Push Notifications
export const getPushVapidKey = () =>
  request<{ public_key: string }>('/push/vapid-key');

export const subscribePush = (data: { user_id: string; endpoint: string; keys: { p256dh: string; auth: string } }) =>
  request<{ status: string }>('/push/subscribe', { method: 'POST', body: JSON.stringify(data) });

export const unsubscribePush = (endpoint: string) =>
  request<{ status: string }>(`/push/unsubscribe?endpoint=${encodeURIComponent(endpoint)}`, { method: 'DELETE' });

// System
export const getSystemStatus = () =>
  request<SystemStatus>('/system/status');

export const wakeSystem = () =>
  request<SystemStatus>('/system/wake', { method: 'POST' });

export const sleepSystem = () =>
  request<SystemStatus>('/system/sleep', { method: 'POST' });

export const scanExpiry = () =>
  request<unknown>('/system/scan-expiry', { method: 'POST' });
