import type { Category } from '../api/types';

const NAME_TO_CATEGORY: Record<string, string> = {
  // 水果 / Fruits
  '蘋果': '水果', '香蕉': '水果', '鳳梨': '水果', '西瓜': '水果',
  '葡萄': '水果', '草莓': '水果', '橘子': '水果', '橙': '水果',
  '柳橙': '水果', '檸檬': '水果', '芒果': '水果', '木瓜': '水果',
  '哈密瓜': '水果', '荔枝': '水果', '龍眼': '水果', '奇異果': '水果',
  '梨': '水果', '水梨': '水果', '桃子': '水果', '李子': '水果',
  '火龍果': '水果', '百香果': '水果', '番石榴': '水果', '芭樂': '水果',
  '柚子': '水果', '柿子': '水果', '榴槤': '水果', '椰子': '水果',
  '釋迦': '水果', '蓮霧': '水果', '楊桃': '水果', '枇杷': '水果',
  'apple': 'Fruits', 'banana': 'Fruits', 'pineapple': 'Fruits',
  'watermelon': 'Fruits', 'grape': 'Fruits', 'strawberry': 'Fruits',
  'orange': 'Fruits', 'lemon': 'Fruits', 'mango': 'Fruits',
  'papaya': 'Fruits', 'kiwi': 'Fruits', 'peach': 'Fruits',
  'pear': 'Fruits', 'cherry': 'Fruits', 'blueberry': 'Fruits',
  'melon': 'Fruits', 'coconut': 'Fruits', 'plum': 'Fruits',
  'pomelo': 'Fruits', 'persimmon': 'Fruits', 'guava': 'Fruits',
  'tacos': 'Others', 'nachos': 'Others', 'churros': 'Others',
  'falafel': 'Others', 'quesadilla': 'Others',

  // 蔬菜 / Vegetables
  '白菜': '蔬菜', '高麗菜': '蔬菜', '花椰菜': '蔬菜', '青花椰菜': '蔬菜',
  '菠菜': '蔬菜', '空心菜': '蔬菜', '韭菜': '蔬菜', '蔥': '蔬菜',
  '洋蔥': '蔬菜', '大蒜': '蔬菜', '薑': '蔬菜', '胡蘿蔔': '蔬菜',
  '紅蘿蔔': '蔬菜', '白蘿蔔': '蔬菜', '番茄': '蔬菜', '小黃瓜': '蔬菜',
  '黃瓜': '蔬菜', '茄子': '蔬菜', '玉米': '蔬菜', '馬鈴薯': '蔬菜',
  '地瓜': '蔬菜', '芹菜': '蔬菜', '青椒': '蔬菜', '辣椒': '蔬菜',
  '香菇': '蔬菜', '金針菇': '蔬菜', '杏鮑菇': '蔬菜', '木耳': '蔬菜',
  '秋葵': '蔬菜', '苦瓜': '蔬菜', '絲瓜': '蔬菜', '冬瓜': '蔬菜',
  '南瓜': '蔬菜', '豌豆': '蔬菜', '毛豆': '蔬菜', '四季豆': '蔬菜',
  'cabbage': 'Vegetables', 'broccoli': 'Vegetables', 'spinach': 'Vegetables',
  'onion': 'Vegetables', 'garlic': 'Vegetables', 'ginger': 'Vegetables',
  'carrot': 'Vegetables', 'tomato': 'Vegetables', 'cucumber': 'Vegetables',
  'eggplant': 'Vegetables', 'corn': 'Vegetables', 'potato': 'Vegetables',
  'mushroom': 'Vegetables', 'celery': 'Vegetables', 'pumpkin': 'Vegetables',
  'zucchini': 'Vegetables', 'asparagus': 'Vegetables', 'lettuce': 'Vegetables',

  // 肉類 / Meat
  '雞肉': '肉類', '牛肉': '肉類', '豬肉': '肉類', '羊肉': '肉類',
  '魚': '肉類', '蝦': '肉類', '花枝': '肉類', '烏賊': '肉類',
  '蟹': '肉類', '螃蟹': '肉類', '培根': '肉類', '火腿': '肉類',
  '香腸': '肉類', '豬排': '肉類', '雞腿': '肉類', '雞胸': '肉類',
  '牛排': '肉類', '鮭魚': '肉類', '鱈魚': '肉類', '鯖魚': '肉類',
  '秋刀魚': '肉類', '吳郭魚': '肉類', '虱目魚': '肉類',
  'chicken': 'Meat', 'beef': 'Meat', 'pork': 'Meat', 'lamb': 'Meat',
  'fish': 'Meat', 'shrimp': 'Meat', 'salmon': 'Meat', 'tuna': 'Meat',
  'bacon': 'Meat', 'ham': 'Meat', 'sausage': 'Meat', 'crab': 'Meat',
  'squid': 'Meat', 'oyster': 'Meat', 'clam': 'Meat',

  // 乳製品 / Dairy
  '牛奶': '乳製品', '鮮奶': '乳製品', '起司': '乳製品', '乳酪': '乳製品',
  '奶油': '乳製品', '優格': '乳製品', '雞蛋': '乳製品', '蛋': '乳製品',
  '鮮奶油': '乳製品', '奶粉': '乳製品', '布丁': '乳製品',
  'milk': 'Dairy', 'cheese': 'Dairy', 'butter': 'Dairy', 'yogurt': 'Dairy',
  'egg': 'Dairy', 'eggs': 'Dairy', 'cream': 'Dairy',

  // 飲料 / Beverages
  '果汁': '飲料', '豆漿': '飲料', '茶': '飲料', '綠茶': '飲料',
  '紅茶': '飲料', '咖啡': '飲料', '可樂': '飲料', '啤酒': '飲料',
  '汽水': '飲料', '礦泉水': '飲料',
  'juice': 'Beverages', 'tea': 'Beverages', 'coffee': 'Beverages',
  'beer': 'Beverages', 'soda': 'Beverages', 'water': 'Beverages',

  // 調味料 / Condiments
  '醬油': '調味料', '鹽': '調味料', '糖': '調味料', '醋': '調味料',
  '胡椒': '調味料', '辣椒醬': '調味料', '番茄醬': '調味料', '美乃滋': '調味料',
  '味噌': '調味料', '麻油': '調味料', '沙拉醬': '調味料',
  'salt': 'Condiments', 'sugar': 'Condiments', 'vinegar': 'Condiments',
  'ketchup': 'Condiments', 'mayo': 'Condiments', 'sauce': 'Condiments',

  // 冷凍食品 / Frozen
  '冰淇淋': '冷凍食品', '水餃': '冷凍食品', '湯圓': '冷凍食品',
  '冷凍披薩': '冷凍食品', '冰棒': '冷凍食品',
  'ice cream': 'Frozen',
};

// Groq key from env (same key used in DashboardPage)
const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY as string;

// Map Chinese category to possible English equivalents and vice versa
const CAT_ALIASES: Record<string, string[]> = {
  '水果': ['Fruits', 'Fruit'],
  '蔬菜': ['Vegetables', 'Vegetable'],
  '肉類': ['Meat'],
  '乳製品': ['Dairy'],
  '飲料': ['Beverages', 'Drinks'],
  '調味料': ['Condiments'],
  '冷凍食品': ['Frozen'],
  '其他': ['Others'],
};

function findCategory(catName: string, categories: Category[]): Category | null {
  // Exact match
  const exact = categories.find(c => c.category_name === catName);
  if (exact) return exact;
  // Alias match
  const aliases = CAT_ALIASES[catName] ?? [];
  for (const alias of aliases) {
    const found = categories.find(c => c.category_name === alias);
    if (found) return found;
  }
  // Reverse alias match (catName is English, look up Chinese)
  for (const [zh, aliasList] of Object.entries(CAT_ALIASES)) {
    if (aliasList.includes(catName)) {
      const found = categories.find(c => c.category_name === zh);
      if (found) return found;
    }
  }
  return null;
}

// 判斷是否為「商品全名」（多字、含空格或長度過長）
// 例：「Extra Apple Lime Flavored Gum」就算含 "apple" 也不該歸 Fruits
function isProductName(name: string): boolean {
  const wordCount = name.trim().split(/\s+/).length;
  return wordCount >= 3 || name.length > 12;
}

async function askGroq(name: string, categories: Category[]): Promise<Category | null> {
  if (!GROQ_KEY) return null;
  try {
    const catNames = categories.map(c => c.category_name).join('、');
    const prompt = `你是食材分類助手。可用類別：${catNames}\n請幫食材「${name}」選一個最合適的類別，只回傳類別名稱，不要其他說明。零食、糖果、口香糖等加工食品請歸為「其他」或「Others」。`;
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 20,
      }),
    });
    const data = await res.json();
    const catName: string = data.choices?.[0]?.message?.content?.trim() ?? '';
    return findCategory(catName, categories);
  } catch {
    return null;
  }
}

export async function inferCategory(name: string, categories: Category[]): Promise<Category | null> {
  if (!name || categories.length === 0) return null;

  const lower = name.toLowerCase();

  // 1. Exact key match
  const exactKey = NAME_TO_CATEGORY[name] ?? NAME_TO_CATEGORY[lower];
  if (exactKey) {
    const cat = findCategory(exactKey, categories);
    if (cat) return cat;
  }

  // 商品全名直接交給 LLM 判斷，避免 "Extra Apple ... Gum" 被誤判為 Fruits
  if (isProductName(name)) {
    const aiCat = await askGroq(name, categories);
    if (aiCat) return aiCat;
  }

  // 2. Substring match（適用於「新鮮鳳梨」等簡短食材名）
  for (const [key, catName] of Object.entries(NAME_TO_CATEGORY)) {
    if (key.length >= 2 && (name.includes(key) || lower.includes(key.toLowerCase()))) {
      const cat = findCategory(catName, categories);
      if (cat) return cat;
    }
  }

  // 3. Groq fallback
  return askGroq(name, categories);
}
