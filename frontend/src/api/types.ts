export interface User {
  user_id: string;
  username: string;
}

export interface Category {
  category_id: number;
  category_name: string;
}

export interface Ingredient {
  ingredient_id: number;
  name: string;
  category_id: number | null;
  default_expire_days: number | null;
}

export interface InventoryItem {
  inventory_id: number;
  user_id: string;
  ingredient_id: number;
  ingredient_name: string | null;
  quantity: number;
  added_date: string;
  expire_date: string;
  custom_expire: boolean;
  urgent_flag: boolean;
}

export interface InventoryCreate {
  user_id: string;
  ingredient_id: number;
  quantity?: number;
  added_date?: string;
  expire_date?: string;
  custom_expire?: boolean;
}

export interface InventoryUpdate {
  quantity?: number;
  expire_date?: string;
  custom_expire?: boolean;
}

export interface SystemStatus {
  status: 'active' | 'sleep';
}
