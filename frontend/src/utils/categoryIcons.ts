export const CATEGORY_ICONS: Record<string, string> = {
  蔬菜:'🥬', 水果:'🍎', 肉類:'🥩', 乳製品:'🧀', 飲料:'🥤',
  調味料:'🧂', 冷凍食品:'🧊', 其他:'📦', 雞蛋:'🥚', 海鮮:'🦐', 主食:'🍚',
  Vegetables:'🥬', Vegetable:'🥬', Fruit:'🍎', Fruits:'🍎',
  Meat:'🥩', Dairy:'🧀', Beverages:'🥤', Drinks:'🥤',
  Condiments:'🧂', Frozen:'🧊', Others:'📦',
  Eggs:'🥚', Seafood:'🦐', Staples:'🍚',
};

export const CAT_ZH: Record<string, string> = {
  Dairy: '乳製品', Eggs: '雞蛋', Vegetables: '蔬菜', Vegetable: '蔬菜',
  Fruits: '水果', Fruit: '水果', Meat: '肉類', Seafood: '海鮮',
  Staples: '主食', Others: '其他', Beverages: '飲料', Drinks: '飲料',
  Condiments: '調味料', Frozen: '冷凍食品',
};

// 顯示用的分類排序（依此順序排列；未列出的會排在最後）
const CATEGORY_ORDER = ['蔬菜', '水果', '肉類', '海鮮', '雞蛋', '乳製品', '主食', '飲料', '其他'];

export function sortCategories<T extends { category_name: string }>(cats: T[]): T[] {
  const order = (name: string) => {
    const zh = CAT_ZH[name] ?? name;
    const i = CATEGORY_ORDER.indexOf(zh);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  return [...cats].sort((a, b) => order(a.category_name) - order(b.category_name));
}
