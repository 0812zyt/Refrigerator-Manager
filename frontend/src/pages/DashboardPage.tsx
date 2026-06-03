import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { getInventory, deleteInventory, updateInventory, updateIngredient, getCategories, getIngredients, getPushVapidKey, subscribePush, unsubscribePush, wakeSystem, createInventory, createIngredient } from '../api/client';
import { inferCategory } from '../utils/categoryInfer';
import type { InventoryItem, Category, Ingredient, User } from '../api/types';
import AddChoiceModal from '../components/AddChoiceModal';
import BarcodeScanModal from '../components/BarcodeScanModal';
import AddItemModal from '../components/AddItemModal';
import ImageRecognizeModal from '../components/ImageRecognizeModal';
import EditItemModal from '../components/EditItemModal';
import CategoryIcon from '../components/CategoryIcon';
import { CAT_ZH, sortCategories } from '../utils/categoryIcons';

interface Props { user: User; onLogout: () => void; }

export { CATEGORY_ICONS, CAT_ZH } from '../utils/categoryIcons';

const getDaysLeft = (d: string) => {
  const t = new Date(); t.setHours(0,0,0,0);
  const [y, m, day] = d.split('-').map(Number);
  const exp = new Date(y, m - 1, day);
  return Math.round((exp.getTime() - t.getTime()) / 86400000);
};


type ModalState = null | 'choice' | 'manual' | 'image' | 'barcode' | 'edit';
interface EnrichedItem extends InventoryItem { categoryName?: string; }



// ── Recipe View ───────────────────────────────────────────────────
const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY as string;

interface IngItem { name: string; amount: string; }
interface SeasonItem { name: string; amount: string; note: string; }

interface GeminiRecipe {
  name: string;
  emoji: string;
  photo_query: string;
  used: string[];
  missing: string[];
  description: string;
  ingredients: IngItem[];
  steps: string[];
  seasonings: SeasonItem[];
  calories: number;
  cookTime: number;
  servings: number;
  photoUrl?: string;
}

const UNSPLASH_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY as string;

async function fetchRecipePhoto(query: string): Promise<string | null> {
  if (!UNSPLASH_KEY || !query) return null;
  const tryFetch = async (q: string) => {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }
    );
    const data = await res.json();
    return (data.results?.[0]?.urls?.small as string) ?? null;
  };
  try {
    return (await tryFetch(query)) ?? (await tryFetch(`${query} food dish`)) ?? null;
  } catch {
    return null;
  }
}

async function autoClassifyIngredients(
  uncategorized: { ingredient_id: number; name: string }[],
  categories: { category_id: number; category_name: string }[],
): Promise<Record<number, number>> {
  if (!GROQ_KEY || uncategorized.length === 0 || categories.length === 0) return {};
  const catNames = categories.map(c => c.category_name).join('、');
  const prompt = `你是食材分類助手。可用類別：${catNames}\n\n請幫以下食材各選一個最合適的類別，以 JSON 格式回傳 {"食材名稱":"類別名稱"}，只回傳 JSON：\n${uncategorized.map(i => `- ${i.name}`).join('\n')}`;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.1 }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const text: string = data.choices?.[0]?.message?.content ?? '';
  const result: Record<string, string> = JSON.parse(text.replace(/```json|```/g, '').trim());
  const catNameToId = Object.fromEntries(categories.map(c => [c.category_name, c.category_id]));
  const mapping: Record<number, number> = {};
  for (const ing of uncategorized) {
    const catId = catNameToId[result[ing.name]];
    if (catId != null) mapping[ing.ingredient_id] = catId;
  }
  return mapping;
}

async function fetchGeminiRecipes(items: { name: string; daysLeft: number }[]): Promise<GeminiRecipe[]> {
  // 依剩餘天數由少到多排序（快過期的優先）
  const sorted = [...items].sort((a, b) => a.daysLeft - b.daysLeft);
  const annotated = sorted.map(i =>
    i.daysLeft <= 2 ? `${i.name}【剩${i.daysLeft}天，務必優先使用】`
    : i.daysLeft <= 5 ? `${i.name}（剩${i.daysLeft}天，建議優先）`
    : `${i.name}（剩${i.daysLeft}天）`
  );
  const urgent = sorted.filter(i => i.daysLeft <= 2).map(i => i.name);

  const prompt = `請根據以下冰箱食材，生成 4 道適合家庭料理的真實食譜，並嚴格依照以下 JSON 格式輸出。

冰箱食材清單（依剩餘新鮮天數排序，前面的越快過期）：${annotated.join('、')}
${urgent.length > 0 ? `\n⚠️ 以下食材即將過期，必須出現在至少一道料理中：${urgent.join('、')}` : ''}

【輸出規則】
- 僅能回傳 JSON 陣列，不可包含 Markdown、解釋、\`\`\`json 或多餘文字
- JSON 必須可直接 JSON.parse() 成功解析
- 所有欄位不可缺少
- 不可產生 null、undefined、空值
- 不可推薦飲料
- 不可推薦需要專業設備或餐廳級技術的料理
- 所有文字一律使用繁體中文（嚴禁英文出現在任何欄位內容，例如 butter→奶油、pie→派皮、oven→烤箱）

【食材規則】
- used：只寫主要食材名稱（不含調味料）
- missing：缺少但必要的主要食材（不含調味料），最多 3 項，越少越好，若可只用現有食材完成則為 []
- used 與 missing 不可重複
- 至少使用 used 中 1~3 項食材
- **優先使用快過期食材**：4 道料理中至少 2 道要使用清單最前面（剩餘天數最少）的食材
- 禁止推薦以缺少食材為核心的料理：例如冰箱沒有飯就不可推薦炒飯，沒有麵就不可推薦炒麵，應改推該食材能做的其他料理

【ingredients / seasonings 規則】
- ingredients：只能放主要食材（不可包含調味料）
- 若料理需要水、高湯、清水等液體，必須列入 ingredients（如 "水" 1000毫升）
- seasonings：只能放調味料（不可包含主要食材）
- 每個 item 必須包含 name、amount；seasonings 額外要有 note（用途）

【steps 規則】
- 4～7 個步驟，每步 1～2 句話
- 必須將相關動作合併（不可把去皮、切片、拌勻各自拆成一步）
- 必須寫清楚：食材名稱、調味料加入時機與份量、火候與時間、完成判斷標準
- ingredients 與 seasonings 的所有項目都必須在 steps 中出現

【photo_query 規則】
- 只能 2~3 個英文單字，全部小寫，必須是常見料理名稱
- 例：apple pie / fried rice / beef noodle / tomato pasta

【數值限制】
- calories：50～1200 整數
- cookTime：5～180 分鐘整數
- servings：1～10 人整數

【輸出格式】
[
  {
    "name": "料理名稱",
    "emoji": "一個相關表情符號",
    "photo_query": "2~3個英文單字",
    "used": ["主要食材"],
    "missing": ["缺少食材"],
    "description": "15字以內描述",
    "ingredients": [{"name": "食材名", "amount": "份量"}],
    "seasonings": [{"name": "調味料名", "amount": "份量", "note": "用途"}],
    "steps": ["步驟1", "步驟2", "步驟3", "步驟4"],
    "calories": 整數,
    "cookTime": 整數,
    "servings": 整數
  }
]`;

  const res = await fetch(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      }),
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message ?? 'Groq API error');
  const text: string = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('Groq 回傳空內容');
  const clean = text.replace(/```json|```/g, '').trim();
  const recipes: GeminiRecipe[] = JSON.parse(clean);
  // Fetch Unsplash photos in parallel
  const withPhotos = await Promise.all(
    recipes.map(async r => ({ ...r, photoUrl: (await fetchRecipePhoto(r.photo_query)) ?? undefined }))
  );
  return withPhotos;
}

interface RecipeState {
  recipes: GeminiRecipe[];
  loading: boolean;
  error: string;
  fetched: boolean;
}

function RecipeDetailModal({ recipe, onClose }: { recipe: GeminiRecipe; onClose: () => void }) {
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:300, padding:'0 0 0 0' }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:520, maxHeight:'88vh', overflowY:'auto', padding:'0 0 40px', boxShadow:'0 -8px 40px rgba(0,0,0,0.2)', animation:'slideUp 0.22s ease' }}
        onClick={e => e.stopPropagation()}>
        {/* 拖曳把手 */}
        <div style={{ display:'flex', justifyContent:'center', padding:'12px 0 0' }}>
          <div style={{ width:36, height:4, borderRadius:2, background:'var(--border)' }} />
        </div>
        {/* Emoji header */}
        <div style={{ height:140, background:'var(--surface-2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:72, margin:'12px 0 0' }}>
          {recipe.emoji}
        </div>
        <div style={{ padding:'20px 24px 0' }}>
          {/* 標題 */}
          <h2 style={{ fontSize:22, fontWeight:800, color:'var(--text)', margin:'0 0 12px', lineHeight:1.3 }}>{recipe.name}</h2>

          {/* 份量 + 時間 */}
          <div style={{ display:'flex', marginBottom:20, borderTop:'1px solid var(--border)', borderBottom:'1px solid var(--border)' }}>
            {recipe.servings > 0 && (
              <div style={{ flex:1, padding:'14px 0', textAlign:'center', borderRight:'1px solid var(--border)' }}>
                <div style={{ fontSize:11, color:'#d97706', fontWeight:700, marginBottom:4 }}>份量</div>
                <div style={{ fontSize:18, fontWeight:800, color:'#d97706' }}>{recipe.servings} 人份</div>
              </div>
            )}
            {recipe.cookTime > 0 && (
              <div style={{ flex:1, padding:'14px 0', textAlign:'center' }}>
                <div style={{ fontSize:11, color:'#d97706', fontWeight:700, marginBottom:4 }}>時間</div>
                <div style={{ fontSize:18, fontWeight:800, color:'#d97706' }}>{recipe.cookTime} 分鐘</div>
              </div>
            )}
          </div>

          {/* 食材 */}
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:15, fontWeight:800, color:'var(--text)', marginBottom:10, paddingBottom:8, borderBottom:'1px solid var(--border)' }}>食材</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 20px' }}>
              {(recipe.ingredients?.length ? recipe.ingredients : recipe.used.map(u => ({ name: u, amount: '' }))).map((ing, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8 }}>
                  <span style={{ fontSize:13, color:'var(--text)' }}>{ing.name}</span>
                  <span style={{ fontSize:13, color:'#d97706', fontWeight:600, flexShrink:0 }}>{ing.amount}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 建議調味 */}
          {recipe.seasonings && recipe.seasonings.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:15, fontWeight:800, color:'var(--text)', marginBottom:10, paddingBottom:8, borderBottom:'1px solid var(--border)' }}>調味料</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 20px' }}>
                {recipe.seasonings.map((s, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8 }}>
                    <span style={{ fontSize:13, color:'var(--text)' }}>{s.name}</span>
                    <span style={{ fontSize:13, color:'#d97706', fontWeight:600, flexShrink:0 }}>{s.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 步驟 */}
          {recipe.steps && recipe.steps.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--text-3)', marginBottom:12, letterSpacing:0.5 }}>步驟</div>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {recipe.steps.map((step, i) => (
                  <div key={i} style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                    <div style={{ width:26, height:26, borderRadius:8, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{i + 1}</div>
                    <div style={{ fontSize:14, color:'var(--text)', lineHeight:1.65, paddingTop:3 }}>{step}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function RecipeView({ items, state, setState }: {
  items: EnrichedItem[];
  state: RecipeState;
  setState: (s: RecipeState) => void;
}) {
  const { recipes, loading, error, fetched } = state;
  const [selected, setSelected] = useState<GeminiRecipe | null>(null);
  // 排除已過期食材，只用未過期的
  const freshItems = items
    .map(i => ({ name: i.ingredient_name ?? '', daysLeft: getDaysLeft(i.expire_date) }))
    .filter(i => i.name && i.daysLeft >= 0);
  const names = freshItems.map(i => i.name);
  const nameKey = freshItems.map(i => `${i.name}:${i.daysLeft}`).join(',');

  const doFetch = (list: { name: string; daysLeft: number }[]) => {
    setState({ recipes: [], loading: true, error: '', fetched: true });
    fetchGeminiRecipes(list)
      .then(r => setState({ recipes: r, loading: false, error: '', fetched: true }))
      .catch(e => setState({ recipes: [], loading: false, error: e instanceof Error ? e.message : '推薦失敗，請稍後再試', fetched: true }));
  };

  useEffect(() => {
    if (freshItems.length === 0 || fetched) return;
    doFetch(freshItems);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameKey]);

  return (
    <div>
      <div style={{ marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h2 style={{ fontSize:18, fontWeight:800, color:'var(--text)', margin:'0 0 4px' }}>今天吃什麼？</h2>
          <p style={{ fontSize:13, color:'var(--text-3)', margin:0 }}>
            {names.length > 0 ? `AI 根據 ${items.length} 樣食材推薦` : '加入食材後顯示 AI 推薦'}
          </p>
        </div>
        {names.length > 0 && !loading && (
          <button onClick={() => doFetch(freshItems)}
            style={{ fontSize:12, padding:'6px 14px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text-3)', cursor:'pointer' }}>
            重新推薦
          </button>
        )}
      </div>

      {loading && (
        <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text-3)' }}>
          <div style={{ width:28, height:28, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.7s linear infinite', margin:'0 auto 12px' }} />
          AI 思考中…
        </div>
      )}

      {!loading && error && (
        <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text-3)' }}>
          <div style={{ fontSize:36, marginBottom:8 }}>⚠️</div>
          <div style={{ fontSize:13, marginBottom:12, color:'#f87171' }}>{error}</div>
          <button onClick={() => doFetch(freshItems)}
            style={{ fontSize:13, padding:'8px 20px', borderRadius:10, border:'none', background:'var(--accent)', color:'#fff', cursor:'pointer' }}>
            重試
          </button>
        </div>
      )}

      {!loading && !error && recipes.length === 0 && names.length === 0 && (
        <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text-3)' }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🍽️</div>加入食材後顯示 AI 食譜推薦
        </div>
      )}

      <div className="fridge-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12 }}>
        {recipes.map((r, i) => (
          <div key={i} onClick={() => setSelected(r)} className="fridge-recipe-card"
            style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, overflow:'hidden', boxShadow:'var(--shadow)', cursor:'pointer', transition:'transform 0.15s, box-shadow 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'none'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow)'; }}>
            <div className="fridge-recipe-card-img" style={{ height:100, background:'var(--surface-2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:52, position:'relative' }}>
              {r.emoji}
              {r.calories > 0 && (
                <span className="fridge-recipe-kcal" style={{ position:'absolute', bottom:6, right:6, fontSize:10, fontWeight:700, color:'#f97316', background:'rgba(255,255,255,0.85)', borderRadius:6, padding:'2px 6px' }}>{r.calories} kcal</span>
              )}
            </div>
            <div className="fridge-recipe-card-body" style={{ padding:'10px 12px 12px' }}>
              <div className="fridge-recipe-card-name" style={{ fontWeight:700, fontSize:14, color:'var(--text)', marginBottom:6 }}>{r.name}</div>
              {r.used.length > 0 && (
                <div style={{ fontSize:10, color:'#22c55e' }}>✓ {r.used.join('、')}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {selected && <RecipeDetailModal recipe={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

interface NotifPrefs {
  daysBefore: number;
  notifTime: string;
  dailyReminder: boolean;
}
function loadNotifPrefs(): NotifPrefs {
  try { return JSON.parse(localStorage.getItem('fridge_notif_prefs') ?? '{}'); } catch { return {} as NotifPrefs; }
}
function saveNotifPrefs(prefs: NotifPrefs) {
  localStorage.setItem('fridge_notif_prefs', JSON.stringify(prefs));
}

// ── Notification Settings Sub-page ────────────────────────────────
function NotifSettingsPage({ user, onBack }: { user: User; onBack: () => void }) {
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifHint, setNotifHint]       = useState('');
  const saved = loadNotifPrefs();
  const [daysBefore, setDaysBefore]     = useState<number>(saved.daysBefore ?? 1);
  const [notifTime, setNotifTime]       = useState<string>(saved.notifTime ?? '08:00');
  const [dailyReminder, setDailyReminder] = useState<boolean>(saved.dailyReminder ?? false);

  const updatePrefs = (patch: Partial<NotifPrefs>) => {
    const next = { daysBefore, notifTime, dailyReminder, ...patch };
    setDaysBefore(next.daysBefore); setNotifTime(next.notifTime); setDailyReminder(next.dailyReminder);
    saveNotifPrefs(next);
  };

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription().then(sub => setNotifEnabled(!!sub))
    );
  }, []);

  const handleNotifToggle = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNotifHint('此瀏覽器不支援推播通知'); return;
    }
    setNotifLoading(true); setNotifHint('');
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe();
        await unsubscribePush(existing.endpoint);
        setNotifEnabled(false); setNotifHint('通知已關閉');
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') { setNotifHint('請在瀏覽器允許通知權限'); setNotifLoading(false); return; }
        const { public_key } = await getPushVapidKey();
        if (!public_key) { setNotifHint('伺服器尚未設定推播金鑰'); setNotifLoading(false); return; }
        const padding = '='.repeat((4 - public_key.length % 4) % 4);
        const base64 = (public_key + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(base64); const key = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) key[i] = raw.charCodeAt(i);
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        await subscribePush({ user_id: user.user_id, endpoint: json.endpoint, keys: json.keys });
        setNotifEnabled(true); setNotifHint('通知已開啟 🎉');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setNotifHint(`失敗：${msg.slice(0, 60)}`);
    }
    setNotifLoading(false);
  };

  const toggle = (on: boolean) => (
    <span style={{ width:40, height:22, borderRadius:11, background: on ? '#6366f1' : 'var(--border)', display:'inline-flex', alignItems:'center', padding:'0 3px', transition:'background 0.2s', flexShrink:0 }}>
      <span style={{ width:16, height:16, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,0.3)', transform: on ? 'translateX(18px)' : 'translateX(0)', transition:'transform 0.2s', display:'block' }} />
    </span>
  );

  return (
    <div>
      {/* 返回標題列 */}
      <div style={{ display:'flex', alignItems:'center', marginBottom:24, position:'relative' }}>
        <button onClick={onBack} style={{ width:34, height:34, borderRadius:10, border:'1px solid var(--border)', background:'var(--surface)', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>←</button>
        <h2 style={{ fontSize:17, fontWeight:800, color:'var(--text)', margin:0, position:'absolute', left:'50%', transform:'translateX(-50%)' }}>通知設定</h2>
      </div>

      {/* 推播開關 */}
      <div style={{ background:'var(--surface)', borderRadius:16, overflow:'hidden', boxShadow:'var(--shadow)', marginBottom:16 }}>
        <button onClick={notifLoading ? undefined : handleNotifToggle}
          style={{ display:'flex', alignItems:'center', gap:14, width:'100%', padding:'16px 18px', background:'none', border:'none', cursor: notifLoading ? 'wait' : 'pointer', textAlign:'left' }}>
          <span style={{ fontSize:18, width:24, textAlign:'center' }}>🔔</span>
          <span style={{ flex:1 }}>
            <span style={{ fontSize:14, color:'var(--text)', display:'block', fontWeight:600 }}>到期提醒推播</span>
            {notifHint && <span style={{ fontSize:11, color: notifEnabled ? '#22c55e' : '#94a3b8' }}>{notifHint}</span>}
          </span>
          {toggle(notifEnabled)}
        </button>
      </div>

      {/* 詳細設定（開啟後才顯示）*/}
      {notifEnabled && (
        <>
          {/* 提前幾天通知 */}
          <div style={{ background:'var(--surface)', borderRadius:16, boxShadow:'var(--shadow)', marginBottom:16, padding:'16px 18px' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text-2)', marginBottom:12 }}>提前幾天通知</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {[0,1,2,3].map(d => (
                <button key={d} onClick={() => updatePrefs({ daysBefore: d })}
                  style={{ padding:'7px 18px', borderRadius:20, border:'none', fontSize:13, fontWeight:600, cursor:'pointer', transition:'all 0.15s',
                    background: daysBefore === d ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'var(--surface-2)',
                    color: daysBefore === d ? '#fff' : 'var(--text-2)' }}>
                  {d === 0 ? '當天' : `${d} 天前`}
                </button>
              ))}
            </div>
          </div>

          {/* 通知時間 */}
          <div style={{ background:'var(--surface)', borderRadius:16, boxShadow:'var(--shadow)', marginBottom:16, padding:'16px 18px' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text-2)', marginBottom:12 }}>通知時間</div>
            <input type="time" value={notifTime} onChange={e => updatePrefs({ notifTime: e.target.value })}
              style={{ padding:'10px 14px', borderRadius:10, border:'1.5px solid var(--border)', background:'var(--surface-2)', color:'var(--text)', fontSize:15, outline:'none', width:'100%', boxSizing:'border-box' as const }} />
          </div>

          {/* 每日提醒 */}
          <div style={{ background:'var(--surface)', borderRadius:16, boxShadow:'var(--shadow)', marginBottom:16 }}>
            <button onClick={() => updatePrefs({ dailyReminder: !dailyReminder })}
              style={{ display:'flex', alignItems:'center', gap:14, width:'100%', padding:'16px 18px', background:'none', border:'none', cursor:'pointer', textAlign:'left' }}>
              <span style={{ fontSize:18, width:24, textAlign:'center' }}>📅</span>
              <span style={{ flex:1 }}>
                <span style={{ fontSize:14, color:'var(--text)', display:'block', fontWeight:600 }}>每日提醒</span>
                <span style={{ fontSize:11, color:'var(--text-3)' }}>每天固定時間提醒冰箱狀態</span>
              </span>
              {toggle(dailyReminder)}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Settings View ─────────────────────────────────────────────────
function SettingsView({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { theme, setTheme } = useTheme();
  const [subPage, setSubPage] = useState<null | 'notif'>(null);

  const row = (icon: string, label: string, right?: React.ReactNode, onClick?: () => void) => (
    <button onClick={onClick} style={{ display:'flex', alignItems:'center', gap:14, width:'100%', padding:'14px 18px', background:'none', border:'none', cursor: onClick ? 'pointer' : 'default', textAlign:'left' }}>
      <span style={{ fontSize:18, width:24, textAlign:'center' }}>{icon}</span>
      <span style={{ fontSize:14, color:'var(--text)', flex:1 }}>{label}</span>
      {right}
    </button>
  );

  const toggle = (on: boolean) => (
    <span style={{ width:40, height:22, borderRadius:11, background: on ? '#6366f1' : 'var(--border)', display:'inline-flex', alignItems:'center', padding:'0 3px', transition:'background 0.2s', flexShrink:0 }}>
      <span style={{ width:16, height:16, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,0.3)', transform: on ? 'translateX(18px)' : 'translateX(0)', transition:'transform 0.2s', display:'block' }} />
    </span>
  );

  if (subPage === 'notif') return <NotifSettingsPage user={user} onBack={() => setSubPage(null)} />;

  return (
    <div>
      {/* Profile card */}
      <div className="fridge-profile-card" style={{ display:'flex', alignItems:'center', gap:14, padding:'20px 18px', background:'var(--surface)', borderRadius:16, marginBottom:20, boxShadow:'var(--shadow)' }}>
        <div style={{ width:52, height:52, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:22, fontWeight:700, flexShrink:0 }}>
          {user.username[0].toUpperCase()}
        </div>
        <div>
          <div style={{ fontWeight:700, fontSize:16, color:'var(--text)' }}>{user.username}</div>
        </div>
      </div>

      <div style={{ background:'var(--surface)', borderRadius:16, overflow:'hidden', boxShadow:'var(--shadow)', marginBottom:16 }}>
        {row(theme === 'dark' ? '☀️' : '🌙', '深色模式', toggle(theme === 'dark'), () => setTheme(theme === 'dark' ? 'light' : 'dark'))}
        <div style={{ height:1, background:'var(--border)', margin:'0 18px' }} />
        {row('🔔', '通知', <span style={{ fontSize:13, color:'var(--text-3)' }}>›</span>, () => setSubPage('notif'))}
      </div>

      <div style={{ background:'var(--surface)', borderRadius:16, overflow:'hidden', boxShadow:'var(--shadow)' }}>
        {row('🚪', '登出', undefined, onLogout)}
      </div>
    </div>
  );
}


export default function DashboardPage({ user, onLogout }: Props) {
  const [items, setItems]           = useState<EnrichedItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [recipeState, setRecipeState] = useState<RecipeState>({ recipes: [], loading: false, error: '', fetched: false });
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState(false);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [searchTerm, setSearchTerm] = useState('');
  const [modal, setModal]           = useState<ModalState>(null);
  const [editItem, setEditItem]     = useState<EnrichedItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [prefill, setPrefill]       = useState<{name?:string;category?:string;photo?:string}|null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [viewMode, setViewMode] = useState<'grid'|'list'>('grid');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [multiDeleteConfirm, setMultiDeleteConfirm] = useState(false);
  const [batchStockConfirm, setBatchStockConfirm] = useState(false);
  const [activeNav, setActiveNav] = useState<'home'|'inventory'|'settings'|'cart'>('inventory');
  const [prevNav, setPrevNav] = useState<'home'|'inventory'|'settings'>('inventory');
  const goCart = () => { if (activeNav !== 'cart') { setPrevNav(activeNav as 'home'|'inventory'|'settings'); setCartSelectionMode(false); setCartSelected(new Set()); } setActiveNav('cart'); };
  const backFromCart = () => setActiveNav(prevNav);
  const [cartItems, setCartItems] = useState<{id:number;name:string;done:boolean;quantity:number;ingredient_id?:number;source?:'outofstock'|'manual'}[]>(() => {
    try { return (JSON.parse(localStorage.getItem('fridge_cart') ?? '[]') as {id:number;name:string;done:boolean;quantity?:number;ingredient_id?:number;source?:'outofstock'|'manual'}[]).map(i => ({ ...i, quantity: i.quantity ?? 1 })); } catch { return []; }
  });
  const [cartInput, setCartInput] = useState('');
  const [outOfStockExpanded, setOutOfStockExpanded] = useState(false);
  const [selectedOOS, setSelectedOOS] = useState<Set<number>>(new Set());
  const [cartSelectionMode, setCartSelectionMode] = useState(false);
  const [cartSelected, setCartSelected] = useState<Set<number>>(new Set());
  const cartLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveCart = (next: {id:number;name:string;done:boolean;quantity:number;ingredient_id?:number;source?:'outofstock'|'manual'}[]) => {
    setCartItems(next);
    localStorage.setItem('fridge_cart', JSON.stringify(next));
  };
  const addCartItem = () => {
    if (!cartInput.trim()) return;
    saveCart([...cartItems, { id: Date.now(), name: cartInput.trim(), done: false, quantity: 1, source: 'manual' }]);
    setCartInput('');
  };
  const toggleCartItem = (id: number) => saveCart(cartItems.map(i => i.id === id ? { ...i, done: !i.done } : i));
  const updateCartQty = (id: number, delta: number) => saveCart(cartItems.map(i => i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i));

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };
  const enterSelection = (id: number) => { setSelectionMode(true); setSelectedIds(new Set([id])); };
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  };
  const exitSelection = () => { setSelectionMode(false); setSelectedIds(new Set()); };
  const addSelectedToCart = () => {
    const sel = items.filter(i => selectedIds.has(i.inventory_id));
    const existing = new Set(cartItems.map(c => c.name));
    const toAdd = sel.filter(i => i.ingredient_name && !existing.has(i.ingredient_name))
      .map((i, idx) => ({ id: Date.now() + idx, name: i.ingredient_name!, done: false, quantity: 1, ingredient_id: i.ingredient_id }));
    if (toAdd.length === 0) { showToast('選取商品已在採買清單中'); return; }
    saveCart([...cartItems, ...toAdd]);
    showToast(`已加入 ${toAdd.length} 項至採買清單`);
    exitSelection();
  };
  const deleteSelected = async () => {
    await Promise.all([...selectedIds].map(id => deleteInventory(id)));
    setMultiDeleteConfirm(false);
    exitSelection();
    loadData();
  };
  const batchStockAll = async () => {
    const doneItems = cartItems.filter(i => cartSelected.has(i.id));
    let successCount = 0;
    const stockedIds: number[] = [];
    let lastError = '';
    await Promise.all(doneItems.map(async (cartItem) => {
      const ingredientId = cartItem.ingredient_id ?? allIngredients.find(i => i.name === cartItem.name)?.ingredient_id;
      if (!ingredientId) return;
      // find existing zero-qty inventory item to update rather than create a new one
      const existing = items.find(i => i.ingredient_id === ingredientId && (i.quantity ?? 1) === 0);
      try {
        const qty = cartItem.quantity ?? 1;
        const today = new Date().toISOString().split('T')[0];
        const ing = allIngredients.find(i => i.ingredient_id === ingredientId);
        const expireDays = ing?.default_expire_days ?? 7;
        const expireDate = new Date();
        expireDate.setDate(expireDate.getDate() + expireDays);
        const expireDateStr = expireDate.toISOString().split('T')[0];
        if (existing) {
          await updateInventory(existing.inventory_id, { quantity: qty, expire_date: expireDateStr, custom_expire: false });
        } else {
          await createInventory({ user_id: user.user_id, ingredient_id: ingredientId, quantity: qty, added_date: today, expire_date: expireDateStr });
        }
        successCount++;
        stockedIds.push(cartItem.id);
      } catch (e) { lastError = e instanceof Error ? e.message : String(e); }
    }));
    saveCart(cartItems.filter(i => !stockedIds.includes(i.id)));
    setCartSelected(new Set());
    setBatchStockConfirm(false);
    loadData();
    const skipped = doneItems.length - successCount;
    if (lastError && successCount === 0) { showToast(`入庫失敗：${lastError.slice(0, 30)}`); return; }
    showToast(skipped > 0 ? `已入庫 ${successCount} 項，${skipped} 項略過` : `已入庫 ${successCount} 項`);
  };

  const addOutOfStockToCart = () => {
    const outOfStock = items.filter(i => (i.quantity ?? 1) === 0 && i.ingredient_name);
    const existing = new Set(cartItems.map(c => c.name));
    const toAdd = outOfStock.filter(i => !existing.has(i.ingredient_name!))
      .map((i, idx) => ({ id: Date.now() + idx, name: i.ingredient_name!, done: false, quantity: 1, ingredient_id: i.ingredient_id, source: 'outofstock' as const }));
    if (toAdd.length === 0) { showToast('所有缺貨商品已在採買清單中'); return; }
    saveCart([...cartItems, ...toAdd]);
    showToast(`已加入 ${toAdd.length} 項缺貨商品`);
  };

  const loadData = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try {
      await Promise.race([wakeSystem(), new Promise(r => setTimeout(r, 8000))]).catch(() => {});
      // 後端可能在 Render 上冷啟動，給 60 秒緩衝
      const [inv, cats, ings] = await Promise.race([
        Promise.all([getInventory(user.user_id), getCategories(), getIngredients()]),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 60000)),
      ]);
      setCategories(cats);
      setAllIngredients(ings);
      const ingMap: Record<number, Ingredient> = {};
      ings.forEach(i => { ingMap[i.ingredient_id] = i; });
      const catMap: Record<number, string> = {};
      cats.forEach(c => { catMap[c.category_id] = c.category_name; });
      const enriched = inv.map(item => ({
        ...item,
        ingredient_name: item.ingredient_name ?? ingMap[item.ingredient_id]?.name ?? null,
        categoryName: ingMap[item.ingredient_id]?.category_id != null ? catMap[ingMap[item.ingredient_id].category_id!] ?? undefined : undefined,
      }));
      setItems(enriched);

      // background: silently auto-classify uncategorized ingredients in inventory
      const inventoryIngIds = new Set(inv.map(i => i.ingredient_id));
      const toClassify = ings.filter(i => i.category_id == null && inventoryIngIds.has(i.ingredient_id));
      if (toClassify.length > 0) {
        autoClassifyIngredients(toClassify, cats).then(async (mapping) => {
          const pairs = Object.entries(mapping) as [string, number][];
          if (pairs.length === 0) return;
          await Promise.all(pairs.map(([ingId, catId]) => updateIngredient(Number(ingId), { category_id: catId })));
          setAllIngredients(prev => prev.map(i => mapping[i.ingredient_id] != null ? { ...i, category_id: mapping[i.ingredient_id] } : i));
          setItems(prev => prev.map(item => {
            const newCatId = mapping[item.ingredient_id];
            if (newCatId == null) return item;
            return { ...item, categoryName: catMap[newCatId] ?? undefined };
          }));
        }).catch(() => {});
      }
    } catch { setLoadError(true); }
    setLoading(false);
  }, [user.user_id]);

  useEffect(() => { loadData(); }, [loadData]);

  // 回到分頁就刷新：太久沒進、其他分頁改過資料、其他瀏覽器改過後台都會自動同步
  useEffect(() => {
    let lastRefresh = Date.now();
    const refreshIfStale = (minMs = 30 * 1000) => {
      if (Date.now() - lastRefresh < minMs) return; // 30 秒內進來不重複拉
      lastRefresh = Date.now();
      loadData();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshIfStale();
    };
    const onFocus = () => refreshIfStale();
    const onStorage = (e: StorageEvent) => {
      // 其他分頁改了購物車或快取，立刻同步
      if (e.key && e.key.startsWith('fridge_')) refreshIfStale(0);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
    };
  }, [loadData]);

  useEffect(() => {
    const id = setInterval(() => { wakeSystem().catch(() => {}); }, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const checkScreenSize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    return { small: w <= 480 && w > h, narrow: w <= 480 };
  };
  const [isSmallScreen, setIsSmallScreen] = useState(() => checkScreenSize().small);
  useEffect(() => {
    const handler = () => {
      const { small, narrow } = checkScreenSize();
      setIsSmallScreen(small);
      if (narrow) setViewMode('grid');
    };
    handler();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (id: number) => { await deleteInventory(id); setDeleteConfirm(null); loadData(); };

  const handleDirectAdd = async (name: string, category?: string, photo?: string) => {
    let ing = allIngredients.find(i => i.name.toLowerCase() === name.toLowerCase()) ?? null;
    if (!ing) {
      const catEntry = category
        ? (categories.find(c => c.category_name === category) ?? await inferCategory(name, categories))
        : await inferCategory(name, categories);
      ing = await createIngredient({ name, category_id: catEntry?.category_id });
    }
    const today = new Date().toISOString().slice(0, 10);
    const days = ing.default_expire_days ?? 7;
    const expireDate = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const created = await createInventory({
      user_id: user.user_id, ingredient_id: ing.ingredient_id,
      quantity: 1, added_date: today, expire_date: expireDate,
    });
    if (photo && created?.inventory_id) {
      try { localStorage.setItem(`fridge_photo_product_${created.inventory_id}`, photo); } catch {}
    }
    loadData();
  };

  const filtered = items.filter(i =>
    (activeCategory === '全部' || i.categoryName === activeCategory) &&
    (!searchTerm || (i.ingredient_name ?? '').toLowerCase().includes(searchTerm.toLowerCase()))
  );
  // ── 480×320 橫向裝置模式：只顯示兩個操作按鈕 ────────────────────
  if (isSmallScreen) {
    return (
      <div style={{ width:'100vw', height:'100vh', background:'#f0f4f8', display:'flex', flexDirection:'column', padding:12, gap:10, boxSizing:'border-box' }}>
        <style>{`
          .dev-card { transition: transform 0.1s, box-shadow 0.1s; }
          .dev-card:active { transform: scale(0.97); box-shadow: 0 2px 8px rgba(0,0,0,0.10) !important; }
        `}</style>

        {/* 影像辨識 */}
        <button className="dev-card" onClick={() => setModal('image')} style={{
          flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          padding:'0 24px', border:'none', borderRadius:20, cursor:'pointer',
          background:'linear-gradient(135deg,#b2f0e8,#80dfd4)',
          boxShadow:'0 6px 20px rgba(128,223,212,0.35)',
        }}>
          <div style={{ width:44, height:44, borderRadius:12, background:'rgba(255,255,255,0.45)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:10 }}>
            <svg width="28" height="28" viewBox="0 0 64 64" fill="none">
              <defs>
                <linearGradient id="camGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#00e5ff"/>
                  <stop offset="100%" stopColor="#2962ff"/>
                </linearGradient>
              </defs>
              {/* Camera body */}
              <rect x="4" y="20" width="56" height="36" rx="6" stroke="url(#camGrad)" strokeWidth="3" fill="none"/>
              {/* Top bump / viewfinder */}
              <path d="M22 20v-6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6" stroke="url(#camGrad)" strokeWidth="3" fill="none" strokeLinecap="round"/>
              {/* Flash square */}
              <rect x="9" y="25" width="8" height="6" rx="1.5" stroke="url(#camGrad)" strokeWidth="2.2" fill="none"/>
              {/* Lens outer circle */}
              <circle cx="32" cy="38" r="12" stroke="url(#camGrad)" strokeWidth="3" fill="none"/>
              {/* Lens inner circle */}
              <circle cx="32" cy="38" r="5" stroke="url(#camGrad)" strokeWidth="2.2" fill="none"/>
            </svg>
          </div>
          <div style={{ fontSize:17, fontWeight:800, color:'#1a3a35', letterSpacing:0.2 }}>影像辨識</div>
          <div style={{ fontSize:11, color:'#2d6b63', marginTop:3, lineHeight:1.4 }}>拍照自動辨識食材</div>
        </button>

        {/* 條碼辨識 */}
        <button className="dev-card" onClick={() => setModal('barcode')} style={{
          flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          padding:'0 24px', border:'none', borderRadius:20, cursor:'pointer',
          background:'linear-gradient(135deg,#fdc9b4,#f9a88e)',
          boxShadow:'0 6px 20px rgba(249,168,142,0.35)',
        }}>
          <div style={{ width:44, height:44, borderRadius:12, background:'rgba(255,255,255,0.45)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:10 }}>
            <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
              <defs>
                <linearGradient id="bcGrad" x1="0" y1="0" x2="48" y2="0" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#FFA726"/>
                  <stop offset="100%" stopColor="#FF1493"/>
                </linearGradient>
              </defs>
              {/* Corner brackets */}
              <path d="M4 14V8a2 2 0 0 1 2-2h6" stroke="url(#bcGrad)" strokeWidth="3" strokeLinecap="round"/>
              <path d="M44 14V8a2 2 0 0 0-2-2h-6" stroke="url(#bcGrad)" strokeWidth="3" strokeLinecap="round"/>
              <path d="M4 34v6a2 2 0 0 0 2 2h6" stroke="url(#bcGrad)" strokeWidth="3" strokeLinecap="round"/>
              <path d="M44 34v6a2 2 0 0 1-2 2h-6" stroke="url(#bcGrad)" strokeWidth="3" strokeLinecap="round"/>
              {/* Bars */}
              <rect x="10" y="13" width="3.5" height="22" rx="1" fill="url(#bcGrad)"/>
              <rect x="15.5" y="13" width="3.5" height="22" rx="1" fill="url(#bcGrad)"/>
              <rect x="21" y="13" width="3.5" height="22" rx="1" fill="url(#bcGrad)"/>
              <rect x="26.5" y="13" width="3.5" height="22" rx="1" fill="url(#bcGrad)"/>
              <rect x="32" y="13" width="3.5" height="22" rx="1" fill="url(#bcGrad)"/>
              <rect x="37.5" y="13" width="0.5" height="22" rx="0.5" fill="url(#bcGrad)"/>
            </svg>
          </div>
          <div style={{ fontSize:17, fontWeight:800, color:'#4a1f0f', letterSpacing:0.2 }}>條碼掃描</div>
        </button>

        {/* Modals */}
        {modal === 'image' && <ImageRecognizeModal deviceMode onClose={() => setModal(null)} onFill={async d => {
          let category = d.category;
          if (!category) {
            const inferred = await inferCategory(d.name, categories);
            if (inferred) category = inferred.category_name;
          }
          setPrefill({ ...d, category });
          setModal('manual');
        }} onDirectAdd={handleDirectAdd} />}
        {modal === 'barcode' && <BarcodeScanModal deviceMode onClose={() => setModal(null)} onFill={d => { setPrefill(d); setModal('manual'); }} />}
        {modal === 'manual' && <AddItemModal userId={user.user_id} prefill={prefill} cachedCategories={categories} cachedIngredients={allIngredients} onClose={() => { setModal(null); setPrefill(null); }} onAdded={loadData} />}
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="fridge-header" style={{ background:'var(--header-bg)', borderBottom:'1px solid var(--border)', height:58, display:'flex', alignItems:'center', padding:'0 18px', position:'sticky', top:0, zIndex:100, boxShadow:'var(--shadow)', gap:12 }}>
        {selectionMode ? (
        <>
          <button onClick={exitSelection} style={{ width:34, height:34, borderRadius:10, border:'1px solid var(--border)', background:'var(--surface-2)', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
          <span style={{ flex:1, textAlign:'center', fontWeight:700, fontSize:16, color:'var(--text)' }}>已選擇 {selectedIds.size} 項</span>
          <div style={{ width:34, flexShrink:0 }} />
        </>
      ) : (
        <>
          {/* Logo */}
          <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
            <div style={{ width:32, height:32, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>🧊</div>
            <span className="fridge-logo-text" style={{ fontWeight:800, fontSize:16, color:'var(--text)', letterSpacing:-0.3 }}>冰箱管家</span>
          </div>

          {/* Search bar — expands to fill middle */}
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
            {showSearch && (
              <input autoFocus value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                onBlur={() => { if (!searchTerm) setShowSearch(false); }}
                placeholder="搜尋食材…"
                style={{ width:'100%', maxWidth:260, padding:'7px 12px', borderRadius:10, border:'1.5px solid var(--border)', background:'var(--surface)', color:'var(--text)', fontSize:13, outline:'none' }} />
            )}
          </div>

          {/* Right icons */}
          <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            <button onClick={() => { setShowSearch(s => !s); if (showSearch) setSearchTerm(''); }}
              style={{ width:34, height:34, borderRadius:10, border:'none', background: showSearch ? 'rgba(99,102,241,0.12)' : 'rgba(0,0,0,0.05)', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.15s' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={showSearch ? '#6366f1' : '#475569'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="10.5" cy="10.5" r="7"/>
                  <line x1="16" y1="16" x2="22" y2="22"/>
                </svg>
              </button>
            <div style={{ position:'relative' }}>
              <button onClick={goCart}
                style={{ width:34, height:34, borderRadius:10, border:'none', background: activeNav==='cart' ? 'rgba(99,102,241,0.12)' : 'rgba(0,0,0,0.05)', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <i className="fi fi-br-shopping-cart" style={{ fontSize:17, color: activeNav==='cart' ? '#6366f1' : '#475569', lineHeight:1 }} />
              </button>
              {cartItems.filter(i => !i.done).length > 0 && (
                <span style={{ position:'absolute', top:-5, right:-5, minWidth:16, height:16, background:'#ef4444', borderRadius:8, fontSize:10, fontWeight:700, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px', pointerEvents:'none' }}>
                  {cartItems.filter(i => !i.done).length}
                </span>
              )}
            </div>
          </div>
        </>
      )}
      </header>

      {/* ── FAB / Multi-select Action Bar ─────────────────────── */}
      {activeNav === 'inventory' && !selectionMode && (
        <button onClick={() => setModal('choice')} className="fridge-fab"
          style={{ position:'fixed', bottom:84, right:20, zIndex:150, width:56, height:56, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', border:'none', fontSize:28, cursor:'pointer', boxShadow:'0 4px 16px rgba(99,102,241,0.45)', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>
          ＋
        </button>
      )}
      {selectionMode && (
        <div style={{ position:'fixed', bottom:64, left:0, right:0, zIndex:120, background:'var(--surface)', borderTop:'1px solid var(--border)', padding:'12px 16px', display:'flex', gap:10, boxShadow:'0 -4px 20px rgba(0,0,0,0.12)' }}>
          <button onClick={addSelectedToCart}
            style={{ flex:1, padding:'13px 0', borderRadius:12, border:'none', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer' }}>
            <i className="fi fi-br-shopping-cart" style={{ fontSize:15, color:'#fff', lineHeight:1 }} /> 加入採買清單
          </button>
          <button onClick={() => setMultiDeleteConfirm(true)}
            style={{ flex:1, padding:'13px 0', borderRadius:12, border:'none', background:'#ef4444', color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer' }}>
            🗑 移除商品
          </button>
        </div>
      )}
      {activeNav === 'cart' && cartSelectionMode && (
        <div style={{ position:'fixed', bottom:64, left:0, right:0, zIndex:120, background:'var(--surface)', borderTop:'1px solid var(--border)', padding:'12px 16px', display:'flex', alignItems:'center', gap:10, boxShadow:'0 -4px 20px rgba(0,0,0,0.12)' }}>
          <button onClick={() => { const allSel = cartSelected.size === cartItems.length; setCartSelected(allSel ? new Set() : new Set(cartItems.map(i => i.id))); }}
            style={{ flex:1, padding:'13px 0', borderRadius:12, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text-2)', fontWeight:600, fontSize:14, cursor:'pointer' }}>
            {cartSelected.size === cartItems.length ? '取消全選' : '全選'}
          </button>
          <button onClick={() => setBatchStockConfirm(true)} disabled={cartSelected.size === 0} className="fridge-batch-btn"
            style={{ flex:1, padding:'13px 0', borderRadius:12, border:'none', background: cartSelected.size > 0 ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'var(--surface-2)', color: cartSelected.size > 0 ? '#fff' : 'var(--text-3)', fontWeight:700, fontSize:14, cursor: cartSelected.size > 0 ? 'pointer' : 'not-allowed' }}>
            加入冰箱
          </button>
          <button onClick={() => { saveCart(cartItems.filter(i => !cartSelected.has(i.id))); setCartSelected(new Set()); }} disabled={cartSelected.size === 0}
            style={{ flex:1, padding:'13px 0', borderRadius:12, border:'none', background: cartSelected.size > 0 ? '#ef4444' : 'var(--surface-2)', color: cartSelected.size > 0 ? '#fff' : 'var(--text-3)', fontWeight:700, fontSize:14, cursor: cartSelected.size > 0 ? 'pointer' : 'not-allowed' }}>
            刪除
          </button>
        </div>
      )}

      <div className="fridge-main" style={{ maxWidth:1100, margin:'0 auto', padding:'24px 20px 180px' }}>

        {activeNav === 'home' && (() => {
          const now = new Date();
          const days = ['週日','週一','週二','週三','週四','週五','週六'];
          return (
            <>
              <div className="fridge-home-date" style={{ marginBottom:20 }}>
                <div style={{ fontSize:22, fontWeight:800, color:'var(--text)' }}>
                  {now.getFullYear()}年{now.getMonth()+1}月{now.getDate()}日
                </div>
                <div style={{ fontSize:14, color:'var(--text-3)', marginTop:2 }}>{days[now.getDay()]}</div>
              </div>
              <RecipeView items={items} state={recipeState} setState={setRecipeState} />
            </>
          );
        })()}
        {activeNav === 'settings' && <SettingsView user={user} onLogout={onLogout} />}
        {activeNav === 'cart' && (() => {

          const outOfStockItems = items.filter(i => (i.quantity ?? 1) === 0 && i.ingredient_name && !cartItems.some(c => c.name === i.ingredient_name));
          const outOfStockCount = outOfStockItems.length;
          return (
          <div>
            {/* Header */}
            <div style={{ display:'flex', alignItems:'center', marginBottom:20, position:'relative' }}>
              {cartSelectionMode ? (
                <button onClick={() => { setCartSelected(new Set()); setCartSelectionMode(false); }}
                  style={{ padding:'6px 14px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface)', cursor:'pointer', fontSize:14, fontWeight:600, color:'var(--text-2)' }}>取消</button>
              ) : (
                <button onClick={backFromCart} style={{ width:34, height:34, borderRadius:10, border:'1px solid var(--border)', background:'var(--surface)', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>←</button>
              )}
              <h2 style={{ fontSize:18, fontWeight:800, color:'var(--text)', margin:0, position:'absolute', left:'50%', transform:'translateX(-50%)' }}>
                {cartSelectionMode ? `已勾選 ${cartSelected.size} 項` : '採買清單'}
              </h2>
              {!cartSelectionMode && (
                <button onClick={() => setCartSelectionMode(true)} style={{ marginLeft:'auto', width:34, height:34, borderRadius:10, border:'1px solid var(--border)', background:'var(--surface)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className="fi fi-rr-list-check" style={{ fontSize:16, color:'var(--text-2)', lineHeight:1 }} />
                </button>
              )}
            </div>

            {/* 缺貨區塊 */}
            {outOfStockCount > 0 && (
              <div style={{ marginBottom:12, borderRadius:12, border:'1px solid rgba(245,158,11,0.25)', background:'rgba(245,158,11,0.04)', overflow:'hidden' }}>
                {/* Header row */}
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px' }}>
                  <i className="fi fi-rr-triangle-warning" style={{ fontSize:14, color:'#f59e0b', lineHeight:1, flexShrink:0 }} />
                  <span style={{ fontSize:13, fontWeight:700, color:'var(--text)', flex:1 }}>缺貨食材（{outOfStockCount}）</span>
                  <button onClick={() => { setOutOfStockExpanded(e => !e); setSelectedOOS(new Set()); }}
                    style={{ fontSize:12, color:'#6366f1', background:'none', border:'none', cursor:'pointer', padding:'2px 6px' }}>
                    {outOfStockExpanded ? '▲ 收合' : '▼ 查看全部'}
                  </button>
                </div>

                {/* Collapsed preview */}
                {!outOfStockExpanded && (
                  <div style={{ padding:'0 14px 10px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
                    <span style={{ fontSize:12, color:'var(--text-3)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {outOfStockItems.slice(0, 4).map(i => i.ingredient_name).join('、')}{outOfStockCount > 4 ? '…' : ''}
                    </span>
                    <button onClick={addOutOfStockToCart}
                      style={{ flexShrink:0, padding:'4px 10px', borderRadius:16, border:'1px solid #94a3b8', background:'transparent', color:'#94a3b8', fontSize:11, cursor:'pointer', whiteSpace:'nowrap' }}>
                      一鍵加入全部
                    </button>
                  </div>
                )}

                {/* Expanded list */}
                {outOfStockExpanded && (
                  <div>
                    <div style={{ borderTop:'1px solid rgba(245,158,11,0.15)' }}>
                      {outOfStockItems.map(item => (
                        <div key={item.inventory_id} onClick={() => setSelectedOOS(prev => { const n = new Set(prev); n.has(item.inventory_id) ? n.delete(item.inventory_id) : n.add(item.inventory_id); return n; })}
                          style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', borderBottom:'1px solid rgba(245,158,11,0.1)', cursor:'pointer' }}>
                          <div style={{ width:18, height:18, borderRadius:4, border:`2px solid ${selectedOOS.has(item.inventory_id) ? '#6366f1' : 'var(--border)'}`, background: selectedOOS.has(item.inventory_id) ? '#6366f1' : 'transparent', color:'#fff', fontSize:11, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s' }}>
                            {selectedOOS.has(item.inventory_id) ? '✓' : ''}
                          </div>
                          <span style={{ fontSize:14, color:'var(--text)' }}>{item.ingredient_name}</span>
                        </div>
                      ))}
                    </div>
                    {/* Actions */}
                    <div style={{ padding:'10px 14px', display:'flex', gap:8, alignItems:'center', borderTop:'1px solid rgba(245,158,11,0.15)' }}>
                      <span style={{ fontSize:12, color:'var(--text-3)', flex:1 }}>已選 {selectedOOS.size} 項</span>
                      <button onClick={() => setSelectedOOS(selectedOOS.size === outOfStockCount ? new Set() : new Set(outOfStockItems.map(i => i.inventory_id)))}
                        style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text-2)', fontSize:12, cursor:'pointer' }}>
                        {selectedOOS.size === outOfStockCount ? '取消全選' : '全選'}
                      </button>
                      <button disabled={selectedOOS.size === 0}
                        onClick={() => {
                          const existing = new Set(cartItems.map(c => c.name));
                          const toAdd = outOfStockItems.filter(i => selectedOOS.has(i.inventory_id) && !existing.has(i.ingredient_name!))
                            .map((i, idx) => ({ id: Date.now() + idx, name: i.ingredient_name!, done: false, quantity: 1, ingredient_id: i.ingredient_id, source: 'outofstock' as const }));
                          if (toAdd.length > 0) saveCart([...cartItems, ...toAdd]);
                          setSelectedOOS(new Set()); setOutOfStockExpanded(false);
                          showToast(`已加入 ${toAdd.length} 項`);
                        }}
                        style={{ padding:'6px 14px', borderRadius:8, border:'none', background: selectedOOS.size === 0 ? 'var(--surface-2)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: selectedOOS.size === 0 ? 'var(--text-3)' : '#fff', fontSize:12, fontWeight:700, cursor: selectedOOS.size === 0 ? 'not-allowed' : 'pointer', transition:'all 0.15s' }}>
                        加入已選項目
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 新增輸入 */}
            {/* 清單 */}
            <div style={{ background:'var(--surface)', borderRadius:16, border:'1px solid var(--border)', overflow:'hidden', marginBottom:80 }}>
              {cartItems.length === 0 && (
                <div style={{ padding:'40px 20px', textAlign:'center', fontSize:14, color:'var(--text-3)' }}>清單是空的，新增採買品項吧！</div>
              )}
              <AnimatePresence initial={false}>
              {[...cartItems].sort((a, b) => Number(a.done) - Number(b.done)).map(item => {
                const isSelected = cartSelected.has(item.id);
                return (
                <motion.div key={item.id}
                  layout
                  transition={{ type:'spring', stiffness:300, damping:30 }}
                  onClick={() => {
                    if (cartSelectionMode) {
                      setCartSelected(prev => { const n = new Set(prev); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n; });
                    } else {
                      toggleCartItem(item.id);
                    }
                  }}
                  onMouseDown={() => { cartLongPressRef.current = setTimeout(() => { setCartSelectionMode(true); }, 600); }}
                  onMouseUp={() => { if (cartLongPressRef.current) clearTimeout(cartLongPressRef.current); }}
                  onTouchStart={e => { e.preventDefault(); cartLongPressRef.current = setTimeout(() => { setCartSelectionMode(true); }, 600); }}
                  onTouchEnd={() => { if (cartLongPressRef.current) clearTimeout(cartLongPressRef.current); }}
                  style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer', userSelect:'none' }}>
                  {/* Checkbox — 只在 selection mode 顯示 */}
                  {cartSelectionMode && (
                    <div style={{ width:24, height:24, borderRadius:6, border:`2px solid ${isSelected ? '#6366f1' : 'var(--border)'}`, background: isSelected ? '#6366f1' : 'transparent', color:'#fff', fontSize:13, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}>
                      {isSelected ? '✓' : ''}
                    </div>
                  )}
                  {/* Name + badge */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:15, color: item.done ? 'var(--text-3)' : 'var(--text)', textDecoration: item.done ? 'line-through' : 'none' }}>{item.name}</div>
                    {item.source === 'outofstock' && (
                      <span style={{ fontSize:10, fontWeight:600, padding:'1px 6px', borderRadius:4, marginTop:2, display:'inline-block', background:'rgba(245,158,11,0.12)', color:'#d97706' }}>
                        缺貨
                      </span>
                    )}
                  </div>
                  {/* Quantity controls */}
                  <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                    <button onClick={e => { e.stopPropagation(); updateCartQty(item.id, -1); }} style={{ width:42, height:42, borderRadius:10, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text)', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>−</button>
                    <span style={{ fontSize:15, fontWeight:600, color:'var(--text)', minWidth:22, textAlign:'center' }}>{item.quantity}</span>
                    <button onClick={e => { e.stopPropagation(); updateCartQty(item.id, 1); }} style={{ width:42, height:42, borderRadius:10, border:'1px solid var(--border)', background:'var(--surface-2)', color:'#6366f1', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>＋</button>
                  </div>
                </motion.div>
              );})}
              </AnimatePresence>
            </div>

            {/* 底部固定輸入列 */}
            <div style={{ position:'fixed', bottom:64, left:0, right:0, zIndex:110, background:'var(--header-bg)', borderTop:'1px solid var(--border)', padding:'10px 16px', display:'flex', gap:10, boxShadow:'0 -4px 16px rgba(0,0,0,0.06)' }}>
              <input value={cartInput} onChange={e => setCartInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCartItem()}
                placeholder="新增品項…"
                style={{ flex:1, padding:'10px 14px', borderRadius:10, border:'1.5px solid var(--border)', fontSize:14, background:'var(--surface)', color:'var(--text)', outline:'none' }} />
              <button onClick={addCartItem} style={{ width:42, height:42, borderRadius:10, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', border:'none', fontSize:20, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>＋</button>
            </div>

          </div>
          );
        })()}
        {activeNav === 'inventory' && <>

        {/* ── Category filter ───────────────────────────────────────── */}
        <div className="fridge-cats" style={{ display:'flex', gap:10, overflowX:'auto', marginBottom:20, paddingBottom:4, scrollbarWidth:'none' }}>
          {['全部', ...sortCategories(categories).map(c => c.category_name)].map(cat => {
            const active = activeCategory === cat;
            return (
              <button key={cat} onClick={() => setActiveCategory(cat)} className="fridge-cat-btn" style={{
                height:42, padding:'0 18px', borderRadius:999, fontSize:13, fontWeight:700,
                cursor:'pointer', transition:'all 0.15s', border:'none', flexShrink:0,
                display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap',
                background: active ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'var(--surface)',
                color: active ? '#fff' : '#6366f1',
                boxShadow: active ? '0 4px 12px rgba(99,102,241,0.3)' : '0 1px 4px rgba(0,0,0,0.08)',
              }}>
                {cat !== '全部' && <CategoryIcon name={cat} size={16} />}{CAT_ZH[cat] ?? cat}
              </button>
            );
          })}
        </div>

        <div style={{ display:'flex', alignItems:'center', marginBottom:14 }}>
          <p className="fridge-item-count" style={{ color:'var(--text-3)', fontSize:12, margin:0 }}>共 {filtered.length} 項食材</p>
          <div className="fridge-view-toggle" style={{ marginLeft:'auto', display:'flex', gap:6, marginRight:4 }}>
            {(['grid','list'] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{ width:28, height:28, borderRadius:8, border:'none', background: viewMode === mode ? '#6366f1' : 'rgba(0,0,0,0.06)', color: viewMode === mode ? '#fff' : '#94a3b8', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, transition:'all 0.15s' }}>
                {mode === 'grid' ? '⊞' : '☰'}
              </button>
            ))}
            <button onClick={() => setSelectionMode(true)} disabled={filtered.length === 0} style={{ width:28, height:28, borderRadius:8, border:'none', background: selectionMode ? '#6366f1' : 'rgba(0,0,0,0.06)', color: selectionMode ? '#fff' : '#94a3b8', cursor: filtered.length === 0 ? 'not-allowed' : 'pointer', opacity: filtered.length === 0 ? 0.4 : 1, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }} aria-label="多選">
              <i className="fi fi-rr-list-check" style={{ fontSize:14, display:'flex', alignItems:'center' }} />
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
            <div style={{ width:36, height:36, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
          </div>
        ) : loadError ? (
          <div style={{ textAlign:'center', padding:'60px 0', color:'var(--text-3)' }}>
            <div style={{ fontSize:40, marginBottom:8 }}>⚠️</div>
            <div style={{ marginBottom:12 }}>無法連線，伺服器可能正在喚醒中…</div>
            <button onClick={loadData} style={{ padding:'8px 20px', borderRadius:10, border:'none', background:'var(--accent)', color:'#fff', fontSize:14, cursor:'pointer' }}>重試</button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 0', color:'var(--text-3)' }}>
            <div style={{ fontSize:40, marginBottom:8 }}>🫙</div>沒有找到食材
          </div>
        ) : viewMode === 'grid' ? (
          <div className="fridge-grid" style={{ display:'grid', gridTemplateColumns: isSmallScreen ? 'repeat(4,1fr)' : 'repeat(auto-fill,minmax(160px,1fr))', gap: isSmallScreen ? 8 : 12 }}>
            {[...filtered].sort((a,b) => {
                const aZero = (a.quantity ?? 1) === 0, bZero = (b.quantity ?? 1) === 0;
                if (aZero !== bZero) return aZero ? 1 : -1;
                return new Date(a.expire_date).getTime() - new Date(b.expire_date).getTime();
              })
              .map(item => <ItemCard key={item.inventory_id} item={item} viewMode="grid" onEdit={() => { setEditItem(item); setModal('edit'); }} onQuantityChange={null} selectionMode={selectionMode} isSelected={selectedIds.has(item.inventory_id)} onLongPress={() => enterSelection(item.inventory_id)} onSelect={() => toggleSelect(item.inventory_id)} />)}
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[...filtered].sort((a,b) => {
                const aZero = (a.quantity ?? 1) === 0, bZero = (b.quantity ?? 1) === 0;
                if (aZero !== bZero) return aZero ? 1 : -1;
                return new Date(a.expire_date).getTime() - new Date(b.expire_date).getTime();
              })
              .map(item => <ItemCard key={item.inventory_id} item={item} viewMode="list" onEdit={() => { setEditItem(item); setModal('edit'); }} selectionMode={selectionMode} isSelected={selectedIds.has(item.inventory_id)} onLongPress={() => enterSelection(item.inventory_id)} onSelect={() => toggleSelect(item.inventory_id)}
                onQuantityChange={async (delta) => {
                  const prev_qty = item.quantity ?? 1;
                  const next = Math.max(0, prev_qty + delta);
                  setItems(prev => prev.map(i => i.inventory_id === item.inventory_id ? { ...i, quantity: next } : i));
                  if (delta > 0 && prev_qty === 0) {
                    const ing = allIngredients.find(i => i.ingredient_id === item.ingredient_id);
                    const expireDays = ing?.default_expire_days ?? 7;
                    const expireDate = new Date();
                    expireDate.setDate(expireDate.getDate() + expireDays);
                    const newExpire = expireDate.toISOString().split('T')[0];
                    await updateInventory(item.inventory_id, { quantity: next, expire_date: newExpire, custom_expire: false });
                    setItems(prev => prev.map(i => i.inventory_id === item.inventory_id ? { ...i, quantity: next, expire_date: newExpire } : i));
                    // 清單裡對應的缺貨標籤拿掉
                    saveCart(cartItems.map(c => c.ingredient_id === item.ingredient_id || c.name === item.ingredient_name ? { ...c, source: undefined } : c));
                  } else {
                    await updateInventory(item.inventory_id, { quantity: next });
                  }
                }} />)}
          </div>
        )}
        </>}
      </div>

      {/* Modals */}
      {modal === 'choice' && <AddChoiceModal onManual={() => { setPrefill(null); setModal('manual'); }} onImage={() => setModal('image')} onBarcode={() => setModal('barcode')} onClose={() => setModal(null)} />}
      {modal === 'barcode' && <BarcodeScanModal onClose={() => setModal(null)} onFill={d => { setPrefill(d); setModal('manual'); }} />}
      {modal === 'image' && <ImageRecognizeModal onClose={() => setModal(null)} onFill={async d => {
        let category = d.category;
        if (!category) {
          const inferred = await inferCategory(d.name, categories);
          if (inferred) category = inferred.category_name;
        }
        setPrefill({ ...d, category });
        setModal('manual');
      }} />}
      {modal === 'manual' && <AddItemModal userId={user.user_id} prefill={prefill} cachedCategories={categories} cachedIngredients={allIngredients} onClose={() => { setModal(null); setPrefill(null); }} onAdded={loadData} />}
      {modal === 'edit' && editItem && <EditItemModal item={editItem} cachedCategories={categories} cachedIngredients={allIngredients} onClose={() => { setModal(null); setEditItem(null); }} onUpdated={loadData} />}

      {/* ── Bottom Nav ───────────────────────────────────────────── */}
      <nav className="fridge-nav" style={{ position:'fixed', bottom:0, left:0, right:0, height:64, background:'var(--header-bg)', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-around', zIndex:100, boxShadow:'0 -2px 12px rgba(0,0,0,0.06)', padding:'0 16px' }}>
        {([
          { key:'home', icon:null as null, label:'食譜' },
          { key:'inventory', icon:null as null, label:'食材' },
          { key:'settings', icon:null, label:'設定' },
        ] as const).map(({ key, icon, label }) => {
          const active = activeNav === key;
          return (
            <button key={key} onClick={() => setActiveNav(key as 'home'|'inventory'|'settings'|'cart')} className="fridge-nav-btn" style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3, background: active ? 'rgba(99,102,241,0.12)' : 'none', border:'none', cursor:'pointer', padding:'7px 24px', borderRadius:14, transition:'background 0.15s', flex:1, maxWidth:100 }}>
              <span style={{ fontSize:22, filter: active ? 'none' : 'grayscale(1) opacity(0.45)', transition:'filter 0.15s', display:'flex', alignItems:'center', justifyContent:'center', height:26 }}>
                {icon ?? (key === 'home' ? (
                  <i className="fi fi-sr-restaurant" style={{ fontSize:20, color: active ? '#6366f1' : '#94a3b8', transition:'color 0.15s', lineHeight:1 }} />
                ) : key === 'inventory' ? (
                  <i className="fi fi-rr-refrigerator" style={{ fontSize:20, color: active ? '#6366f1' : '#94a3b8', transition:'color 0.15s', lineHeight:1 }} />
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#6366f1' : '#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition:'stroke 0.15s' }}>
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                ))}
              </span>
              <span style={{ fontSize:11, fontWeight: active ? 700 : 500, color: active ? '#6366f1' : 'var(--text-3)', transition:'color 0.15s' }}>{label}</span>
            </button>
          );
        })}
      </nav>

      {deleteConfirm != null && (
        <div style={overlay} onClick={() => setDeleteConfirm(null)}>
          <div style={{ ...modalStyle, maxWidth:340, textAlign:'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:36, marginBottom:8 }}>🗑️</div>
            <h3 style={{ fontWeight:700, color:'var(--text)', marginBottom:6 }}>確認刪除？</h3>
            <p style={{ color:'var(--text-3)', fontSize:14, marginBottom:24 }}>此操作無法復原</p>
            <div style={{ display:'flex', gap:10 }}>
              <button style={cancelBtn} onClick={() => setDeleteConfirm(null)}>取消</button>
              <button style={{ ...saveBtn, background:'#ef4444' }} onClick={() => handleDelete(deleteConfirm)}>確認刪除</button>
            </div>
          </div>
        </div>
      )}

      {multiDeleteConfirm && (
        <div style={overlay} onClick={() => setMultiDeleteConfirm(false)}>
          <div style={{ ...modalStyle, maxWidth:340, textAlign:'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:36, marginBottom:8 }}>🗑️</div>
            <h3 style={{ fontWeight:700, color:'var(--text)', marginBottom:6 }}>確認移除？</h3>
            <p style={{ color:'var(--text-3)', fontSize:14, marginBottom:24 }}>確定要移除 {selectedIds.size} 項商品嗎？</p>
            <div style={{ display:'flex', gap:10 }}>
              <button style={cancelBtn} onClick={() => setMultiDeleteConfirm(false)}>取消</button>
              <button style={{ ...saveBtn, background:'#ef4444' }} onClick={deleteSelected}>確認移除</button>
            </div>
          </div>
        </div>
      )}

      {batchStockConfirm && (() => {
        const doneItems = cartItems.filter(i => cartSelected.has(i.id));
        const matchable = doneItems.filter(ci => allIngredients.some(i => i.name === ci.name));
        const unmatched = doneItems.filter(ci => !allIngredients.some(i => i.name === ci.name));
        return (
          <div style={overlay} onClick={() => setBatchStockConfirm(false)}>
            <div style={{ ...modalStyle, maxWidth:360 }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize:32, textAlign:'center', marginBottom:8 }}>📦</div>
              <h3 style={{ fontWeight:800, color:'var(--text)', marginBottom:4, textAlign:'center' }}>一鍵入庫</h3>
              <p style={{ color:'var(--text-3)', fontSize:13, marginBottom:16, textAlign:'center' }}>以下商品將以預設數量（1）入庫</p>
              <div style={{ background:'var(--surface-2)', borderRadius:12, padding:'10px 14px', marginBottom:matchable.length > 0 ? 12 : 0, maxHeight:200, overflowY:'auto' }}>
                {matchable.map(ci => (
                  <div key={ci.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', fontSize:14, color:'var(--text)' }}>
                    <span style={{ color:'#22c55e', fontWeight:700 }}>✓</span>{ci.name}
                  </div>
                ))}
              </div>
              {unmatched.length > 0 && (
                <div style={{ background:'rgba(239,68,68,0.08)', borderRadius:12, padding:'10px 14px', marginBottom:12, maxHeight:120, overflowY:'auto' }}>
                  <div style={{ fontSize:12, color:'#ef4444', fontWeight:700, marginBottom:4 }}>以下商品找不到食材，將略過：</div>
                  {unmatched.map(ci => (
                    <div key={ci.id} style={{ fontSize:13, color:'#94a3b8', padding:'3px 0' }}>✕ {ci.name}</div>
                  ))}
                </div>
              )}
              {matchable.length === 0 && (
                <p style={{ color:'#ef4444', fontSize:13, textAlign:'center', marginBottom:12 }}>沒有可識別的商品可以入庫</p>
              )}
              <div style={{ display:'flex', gap:10, marginTop:4 }}>
                <button style={cancelBtn} onClick={() => setBatchStockConfirm(false)}>取消</button>
                <button style={{ ...saveBtn, opacity: matchable.length === 0 ? 0.45 : 1 }} disabled={matchable.length === 0} onClick={batchStockAll}>
                  確認入庫 {matchable.length > 0 ? `(${matchable.length} 項)` : ''}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {toast && (
        <div style={{ position:'fixed', bottom:160, left:'50%', transform:'translateX(-50%)', background:'rgba(15,23,42,0.88)', color:'#fff', padding:'10px 22px', borderRadius:20, fontSize:14, fontWeight:600, zIndex:500, whiteSpace:'nowrap', animation:'fadeIn 0.18s ease', pointerEvents:'none' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function ItemCard({ item, viewMode, onEdit, onQuantityChange, selectionMode, isSelected, onLongPress, onSelect }: {
  item: EnrichedItem; viewMode: 'grid'|'list'; onEdit: ()=>void;
  onQuantityChange: ((delta: number) => void) | null;
  selectionMode: boolean; isSelected: boolean; onLongPress: ()=>void; onSelect: ()=>void;
}) {
  const days = getDaysLeft(item.expire_date);
  const [hovered, setHovered] = useState(false);
  const photo = localStorage.getItem(`fridge_photo_product_${item.inventory_id}`);
  const customIcon = localStorage.getItem(`fridge_icon_${item.inventory_id}`);
  const isZeroQty = (item.quantity ?? 1) === 0;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const startPress = () => { didLongPress.current = false; timerRef.current = setTimeout(() => { didLongPress.current = true; onLongPress(); }, 600); };
  const endPress = () => { if (timerRef.current) clearTimeout(timerRef.current); };
  const handleClick = () => { if (didLongPress.current) { didLongPress.current = false; return; } if (selectionMode) { onSelect(); return; } onEdit(); };

  const barColor = days < 0 ? '#ef4444' : days <= 2 ? '#f59e0b' : '#22c55e';
  const dayLabel = days < 0 ? `已過期 ${Math.abs(days)} 天` : days === 0 ? '今天到期' : `剩 ${days} 天`;

  const cardBase: React.CSSProperties = {
    background:'var(--surface)', border: isSelected ? '2px solid #6366f1' : '1.5px solid var(--border)',
    boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow)',
    transition:'box-shadow 0.15s, transform 0.15s',
    transform: hovered ? 'translateY(-2px)' : 'none',
    cursor:'pointer', overflow:'hidden', position:'relative',
    opacity: isZeroQty ? 0.55 : 1,
  };

  const imgContent = customIcon
    ? <span style={{ fontSize: viewMode === 'grid' ? 90 : 40 }}>{customIcon}</span>
    : photo
      ? <img src={photo} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
      : <CategoryIcon name={item.categoryName ?? ''} size={viewMode === 'grid' ? 90 : 40} />;

  const selectionCircle = (size: number) => (
    <div style={{ width:size, height:size, borderRadius:'50%', flexShrink:0,
      background: isSelected ? '#6366f1' : 'rgba(255,255,255,0.85)',
      border: isSelected ? `2px solid #6366f1` : '2px solid rgba(0,0,0,0.22)',
      display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.55, color:'#fff', transition:'all 0.15s' }}>
      {isSelected && '✓'}
    </div>
  );

  if (viewMode === 'grid') {
    return (
      <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => { setHovered(false); endPress(); }}
        onMouseDown={startPress} onMouseUp={endPress}
        onTouchStart={startPress} onTouchEnd={endPress} onTouchMove={endPress}
        onClick={handleClick} className={`fridge-card${isZeroQty ? ' fridge-zero-qty' : ''}`} style={{ ...cardBase, borderRadius:16, display:'flex', flexDirection:'column' }}>
        <div className="fridge-card-img" style={{ height:130, background:'var(--surface-2)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', position:'relative', flexShrink:0 }}>
          {imgContent}
          {selectionMode && <div style={{ position:'absolute', top:6, left:6 }}>{selectionCircle(22)}</div>}
          {isZeroQty && (
            <div style={{ position:'absolute', bottom:6, left:6, background:'rgba(0,0,0,0.55)', color:'#fff', fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:6 }}>已用完</div>
          )}
        </div>
        <div className="fridge-card-body" style={{ flex:1, padding:'8px 10px 10px', display:'flex', flexDirection:'column', justifyContent:'space-between', minHeight:0 }}>
          <div className="fridge-card-name" style={{ fontWeight:700, fontSize:13, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {item.ingredient_name ?? `食材 #${item.ingredient_id}`}
          </div>
          <div>
            <div className="fridge-card-days" style={{ fontSize:11, color: isZeroQty ? 'var(--text-3)' : barColor, fontWeight:600 }}>{isZeroQty ? '數量 0' : dayLabel}</div>
            <div className="fridge-card-date" style={{ fontSize:10, color:'var(--text-3)', marginTop:2 }}>{item.expire_date}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => { setHovered(false); endPress(); }}
      onMouseDown={startPress} onMouseUp={endPress}
      onTouchStart={startPress} onTouchEnd={endPress} onTouchMove={endPress}
      onClick={handleClick} className="fridge-list-row" style={{ ...cardBase, borderRadius:12, display:'flex', alignItems:'center', gap:12, padding:'10px 14px' }}>
      {selectionMode && <div style={{ flexShrink:0 }}>{selectionCircle(22)}</div>}
      <div className="fridge-list-thumb" style={{ width:52, height:52, borderRadius:10, background:'var(--surface-2)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0, position:'relative' }}>
        {imgContent}
        {isZeroQty && (
          <div style={{ position:'absolute', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.38)', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:10 }}>
            <span style={{ color:'#fff', fontSize:9, fontWeight:700 }}>已用完</span>
          </div>
        )}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:700, fontSize:14, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {item.ingredient_name ?? `食材 #${item.ingredient_id}`}
        </div>
        <div style={{ fontSize:12, color:'var(--text-3)', marginTop:2 }}>
          {item.categoryName ?? '未分類'} · 到期 {item.expire_date}
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <span style={{ fontSize:12, color: isZeroQty ? 'var(--text-3)' : barColor, fontWeight:600, whiteSpace:'nowrap' }}>{isZeroQty ? '已用完' : dayLabel}</span>
        {!selectionMode && onQuantityChange && (
          <div onClick={e => e.stopPropagation()} style={{ display:'flex', alignItems:'center', gap:4, background:'var(--surface-2)', borderRadius:8, padding:'2px 4px' }}>
            <button onClick={() => onQuantityChange(-1)}
              style={{ width:22, height:22, borderRadius:6, border:'none', background:'none', cursor:'pointer', fontSize:16, fontWeight:700, color:'var(--text-2)', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>−</button>
            <span style={{ fontSize:13, fontWeight:700, color:'var(--text)', minWidth:16, textAlign:'center' }}>{item.quantity ?? 1}</span>
            <button onClick={() => onQuantityChange(+1)}
              style={{ width:22, height:22, borderRadius:6, border:'none', background:'none', cursor:'pointer', fontSize:16, fontWeight:700, color:'var(--text-2)', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>＋</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared styles (used by modals) ───────────────────────────────
export const overlay: React.CSSProperties = { position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16 };
export const modalStyle: React.CSSProperties = { background:'var(--surface)', borderRadius:20, padding:28, width:'100%', maxWidth:460, boxShadow:'0 24px 64px rgba(0,0,0,0.25)', animation:'fadeIn 0.15s ease' };
export const modalTitle: React.CSSProperties = { fontSize:18, fontWeight:800, color:'var(--text)', margin:'0 0 20px' };
export const cancelBtn: React.CSSProperties = { flex:1, padding:11, borderRadius:10, border:'1.5px solid var(--border)', background:'var(--surface-2)', color:'var(--text-2)', fontWeight:600, cursor:'pointer', fontSize:14 };
export const saveBtn: React.CSSProperties = { flex:1, padding:11, borderRadius:10, border:'none', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', fontWeight:700, cursor:'pointer', fontSize:14 };
export const fieldStyle: React.CSSProperties = { marginBottom:14 };
export const labelStyle: React.CSSProperties = { display:'block', fontSize:13, fontWeight:600, color:'var(--text-2)', marginBottom:6 };
export const inputStyle: React.CSSProperties = { width:'100%', padding:'10px 14px', borderRadius:10, border:'1.5px solid var(--border)', fontSize:14, outline:'none', boxSizing:'border-box', background:'var(--surface-2)', color:'var(--text)' };
