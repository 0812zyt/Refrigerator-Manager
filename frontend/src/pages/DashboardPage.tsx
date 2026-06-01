import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { getInventory, deleteInventory, updateInventory, getCategories, getIngredients, getPushVapidKey, subscribePush, unsubscribePush, wakeSystem } from '../api/client';
import type { InventoryItem, Category, Ingredient, User } from '../api/types';
import AddChoiceModal from '../components/AddChoiceModal';
import AddItemModal from '../components/AddItemModal';
import ImageRecognizeModal from '../components/ImageRecognizeModal';
import EditItemModal from '../components/EditItemModal';

interface Props { user: User; onLogout: () => void; }

export const CATEGORY_ICONS: Record<string, string> = {
  蔬菜:'🥬', 水果:'🍎', 肉類:'🥩', 乳製品:'🧀', 飲料:'🥤',
  調味料:'🧂', 冷凍食品:'🧊', 其他:'📦',
  Vegetables:'🥬', Vegetable:'🥬', Fruit:'🍎', Fruits:'🍎',
  Meat:'🥩', Dairy:'🧀', Beverages:'🥤', Drinks:'🥤',
  Condiments:'🧂', Frozen:'🧊', Others:'📦',
};

const getDaysLeft = (d: string) => {
  const t = new Date(); t.setHours(0,0,0,0);
  const [y, m, day] = d.split('-').map(Number);
  const exp = new Date(y, m - 1, day);
  return Math.round((exp.getTime() - t.getTime()) / 86400000);
};


type ModalState = null | 'choice' | 'manual' | 'image' | 'edit';
interface EnrichedItem extends InventoryItem { categoryName?: string; }



// ── Recipe View ───────────────────────────────────────────────────
const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY as string;

interface IngItem { name: string; amount: string; }
interface SeasonItem { name: string; amount: string; note: string; }

interface GeminiRecipe {
  name: string;
  emoji: string;
  used: string[];
  missing: string[];
  description: string;
  ingredients: IngItem[];
  steps: string[];
  seasonings: SeasonItem[];
  calories: number;
  cookTime: number;
  servings: number;
}

async function fetchGeminiRecipes(ingredients: string[]): Promise<GeminiRecipe[]> {
  const prompt = `你是一個食譜助手。根據以下冰箱食材，推薦 4 道料理。

食材清單：${ingredients.join('、')}

請以 JSON 陣列格式回傳，格式如下（只回傳 JSON，不要其他說明）：
[
  {
    "name": "料理名稱",
    "emoji": "一個相關表情符號",
    "used": ["會用到的主要食材名稱（不含調味料，只寫名稱）"],
    "missing": ["冰箱裡沒有、但這道料理必需的主要食材（不包含鹽、糖、油、醬油、胡椒等常見調味料）"],
    "description": "簡短料理描述（15字以內）",
    "ingredients": [{"name": "食材名", "amount": "份量（如300克、2顆、150毫升）"}],
    "steps": ["每個步驟寫成一句完整動作，說明動作、火候或時間，例如：煮沸水加入少許鹽，放入義大利麵煮8分鐘至彈牙"],
    "seasonings": [{"name": "調味料名", "amount": "份量（如1小匙、適量）", "note": "用途（如提味、增香）"}],
    "calories": 每份大約熱量整數,
    "cookTime": 烹飪時間分鐘數整數,
    "servings": 幾人份整數
  }
]
注意：
- 所有文字（食材名、步驟、調味料等）一律使用繁體中文，不可出現英文
- used / missing 只填主要食材名稱（不含份量），調味料一律放 seasonings
- ingredients 和 seasonings 都必須是物件陣列，包含 name、amount、（seasonings 還有 note）
- seasonings 給 2～5 項常見調味料，每項都要有 amount
- steps 給 4～7 步，每步一句話（50字以內），像食譜書一樣清楚說明動作與火候
- calories、cookTime、servings 只填整數數字`;

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
  return JSON.parse(clean);
}

interface RecipeState {
  recipes: GeminiRecipe[];
  loading: boolean;
  error: string;
  fetched: boolean;
}

function RecipeDetailModal({ recipe, onClose }: { recipe: GeminiRecipe; onClose: () => void }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:300, padding:'0 0 0 0' }}
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
  const names = items.map(i => i.ingredient_name ?? '').filter(Boolean);
  const nameKey = names.join(',');

  const doFetch = (nameList: string[]) => {
    setState({ recipes: [], loading: true, error: '', fetched: true });
    fetchGeminiRecipes(nameList)
      .then(r => setState({ recipes: r, loading: false, error: '', fetched: true }))
      .catch(e => setState({ recipes: [], loading: false, error: e instanceof Error ? e.message : '推薦失敗，請稍後再試', fetched: true }));
  };

  useEffect(() => {
    if (names.length === 0 || fetched) return;
    doFetch(names);
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
          <button onClick={() => doFetch(names)}
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
          <button onClick={() => doFetch(names)}
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

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12 }}>
        {recipes.map((r, i) => (
          <div key={i} onClick={() => setSelected(r)}
            style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, overflow:'hidden', boxShadow:'var(--shadow)', cursor:'pointer', transition:'transform 0.15s, box-shadow 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'none'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow)'; }}>
            <div style={{ height:100, background:'var(--surface-2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:52, position:'relative' }}>
              {r.emoji}
              {r.calories > 0 && (
                <span style={{ position:'absolute', bottom:6, right:6, fontSize:10, fontWeight:700, color:'#f97316', background:'rgba(255,255,255,0.85)', borderRadius:6, padding:'2px 6px' }}>{r.calories} kcal</span>
              )}
            </div>
            <div style={{ padding:'10px 12px 12px' }}>
              <div style={{ fontWeight:700, fontSize:14, color:'var(--text)', marginBottom:6 }}>{r.name}</div>
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
      <div style={{ display:'flex', alignItems:'center', gap:14, padding:'20px 18px', background:'var(--surface)', borderRadius:16, marginBottom:20, boxShadow:'var(--shadow)' }}>
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
  const [prefill, setPrefill]       = useState<{name?:string;category?:string}|null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [viewMode, setViewMode] = useState<'grid'|'list'>('grid');
  const [activeNav, setActiveNav] = useState<'home'|'inventory'|'settings'|'cart'>('inventory');
  const [prevNav, setPrevNav] = useState<'home'|'inventory'|'settings'>('inventory');
  const goCart = () => { setPrevNav(activeNav as 'home'|'inventory'|'settings'); setActiveNav('cart'); };
  const backFromCart = () => setActiveNav(prevNav);
  const [cartItems, setCartItems] = useState<{id:number;name:string;done:boolean}[]>(() => {
    try { return JSON.parse(localStorage.getItem('fridge_cart') ?? '[]'); } catch { return []; }
  });
  const [cartInput, setCartInput] = useState('');

  const saveCart = (next: {id:number;name:string;done:boolean}[]) => {
    setCartItems(next);
    localStorage.setItem('fridge_cart', JSON.stringify(next));
  };
  const addCartItem = () => {
    if (!cartInput.trim()) return;
    saveCart([...cartItems, { id: Date.now(), name: cartInput.trim(), done: false }]);
    setCartInput('');
  };
  const toggleCartItem = (id: number) => saveCart(cartItems.map(i => i.id === id ? { ...i, done: !i.done } : i));
  const removeCartItem = (id: number) => saveCart(cartItems.filter(i => i.id !== id));

  const loadData = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try {
      await wakeSystem().catch(() => {});
      const [inv, cats, ings] = await Promise.all([getInventory(user.user_id), getCategories(), getIngredients()]);
      setCategories(cats);
      setAllIngredients(ings);
      const ingMap: Record<number, Ingredient> = {};
      ings.forEach(i => { ingMap[i.ingredient_id] = i; });
      const catMap: Record<number, string> = {};
      cats.forEach(c => { catMap[c.category_id] = c.category_name; });
      setItems(inv.map(item => ({
        ...item,
        ingredient_name: item.ingredient_name ?? ingMap[item.ingredient_id]?.name ?? null,
        categoryName: ingMap[item.ingredient_id]?.category_id != null ? catMap[ingMap[item.ingredient_id].category_id!] ?? undefined : undefined,
      })));
    } catch { setLoadError(true); }
    setLoading(false);
  }, [user.user_id]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const id = setInterval(() => { wakeSystem().catch(() => {}); }, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const handleDelete = async (id: number) => { await deleteInventory(id); setDeleteConfirm(null); loadData(); };

  const filtered = items.filter(i =>
    (activeCategory === '全部' || i.categoryName === activeCategory) &&
    (!searchTerm || (i.ingredient_name ?? '').toLowerCase().includes(searchTerm.toLowerCase()))
  );
  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <header style={{ background:'var(--header-bg)', borderBottom:'1px solid var(--border)', height:58, display:'flex', alignItems:'center', padding:'0 18px', position:'sticky', top:0, zIndex:100, boxShadow:'var(--shadow)', gap:12 }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <div style={{ width:32, height:32, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>🧊</div>
          <span style={{ fontWeight:800, fontSize:16, color:'var(--text)', letterSpacing:-0.3 }}>冰箱管家</span>
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
          {/* Search */}
          <button onClick={() => { setShowSearch(s => !s); if (showSearch) setSearchTerm(''); }}
            style={{ width:34, height:34, borderRadius:10, border:'none', background: showSearch ? 'rgba(99,102,241,0.12)' : 'rgba(0,0,0,0.05)', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.15s' }}>🔍</button>
          {/* Cart */}
          <div style={{ position:'relative' }}>
            <button onClick={goCart}
              style={{ width:34, height:34, borderRadius:10, border:'none', background: activeNav==='cart' ? 'rgba(99,102,241,0.12)' : 'rgba(0,0,0,0.05)', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>🛒</button>
            {cartItems.filter(i => !i.done).length > 0 && (
              <span style={{ position:'absolute', top:4, right:4, minWidth:16, height:16, background:'#ef4444', borderRadius:8, fontSize:10, fontWeight:700, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px', pointerEvents:'none' }}>
                {cartItems.filter(i => !i.done).length}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ── FAB ─────────────────────────────────────────────────── */}
      {activeNav === 'inventory' && (
        <button onClick={() => setModal('choice')}
          style={{ position:'fixed', bottom:80, left:'50%', transform:'translateX(-50%)', zIndex:150, padding:'11px 22px', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', border:'none', borderRadius:24, fontSize:13, fontWeight:600, cursor:'pointer', boxShadow:'0 3px 12px rgba(99,102,241,0.3)', whiteSpace:'nowrap', letterSpacing:0.2 }}>
          ＋ 新增食材
        </button>
      )}

      <div style={{ maxWidth:1100, margin:'0 auto', padding:'24px 20px 180px' }}>

        {activeNav === 'home' && (() => {
          const now = new Date();
          const days = ['週日','週一','週二','週三','週四','週五','週六'];
          return (
            <>
              <div style={{ marginBottom:20 }}>
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
        {activeNav === 'cart' && (
          <div>
            <div style={{ display:'flex', alignItems:'center', marginBottom:24, position:'relative' }}>
              <button onClick={backFromCart} style={{ width:34, height:34, borderRadius:10, border:'1px solid var(--border)', background:'var(--surface)', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>←</button>
              <h2 style={{ fontSize:18, fontWeight:800, color:'var(--text)', margin:0, position:'absolute', left:'50%', transform:'translateX(-50%)' }}>🛒 購物清單</h2>
              {cartItems.length > 0 && (
                <button onClick={() => saveCart([])} style={{ marginLeft:'auto', fontSize:13, color:'#94a3b8', background:'none', border:'1px solid var(--border)', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>清除全部</button>
              )}
            </div>
            <div style={{ background:'var(--surface)', borderRadius:16, border:'1px solid var(--border)', overflow:'hidden', marginBottom:16 }}>
              {cartItems.length === 0 && (
                <div style={{ padding:'40px 20px', textAlign:'center', fontSize:14, color:'var(--text-3)' }}>清單是空的，新增購物品項吧！</div>
              )}
              {cartItems.map(item => (
                <div key={item.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
                  <button onClick={() => toggleCartItem(item.id)} style={{ width:26, height:26, borderRadius:8, border:`2px solid ${item.done ? '#6366f1' : 'var(--border)'}`, background: item.done ? '#6366f1' : 'transparent', color:'#fff', fontSize:14, cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}>
                    {item.done ? '✓' : ''}
                  </button>
                  <span style={{ flex:1, fontSize:15, color:'var(--text)', textDecoration: item.done ? 'line-through' : 'none', opacity: item.done ? 0.45 : 1 }}>{item.name}</span>
                  <button onClick={() => removeCartItem(item.id)} style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer', fontSize:16, padding:4 }}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <input value={cartInput} onChange={e => setCartInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCartItem()}
                placeholder="新增品項…"
                style={{ flex:1, padding:'12px 16px', borderRadius:12, border:'1.5px solid var(--border)', fontSize:15, background:'var(--surface)', color:'var(--text)', outline:'none' }} />
              <button onClick={addCartItem} style={{ padding:'12px 20px', borderRadius:12, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>＋</button>
            </div>
          </div>
        )}
        {activeNav === 'inventory' && <>

        {/* ── Category filter ───────────────────────────────────────── */}
        <div style={{ display:'flex', gap:10, overflowX:'auto', marginBottom:20, paddingBottom:4, scrollbarWidth:'none' }}>
          {['全部', ...categories.map(c => c.category_name)].map(cat => {
            const active = activeCategory === cat;
            return (
              <button key={cat} onClick={() => setActiveCategory(cat)} style={{
                height:42, padding:'0 18px', borderRadius:999, fontSize:13, fontWeight:700,
                cursor:'pointer', transition:'all 0.15s', border:'none', flexShrink:0,
                display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap',
                background: active ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'var(--surface)',
                color: active ? '#fff' : '#6366f1',
                boxShadow: active ? '0 4px 12px rgba(99,102,241,0.3)' : '0 1px 4px rgba(0,0,0,0.08)',
              }}>
                {cat !== '全部' && <span style={{ fontSize:16 }}>{CATEGORY_ICONS[cat] ?? '📦'}</span>}{cat}
              </button>
            );
          })}
        </div>

        <div style={{ display:'flex', alignItems:'center', marginBottom:14 }}>
          <p style={{ color:'var(--text-3)', fontSize:12, margin:0 }}>共 {filtered.length} 項食材</p>
          <div style={{ marginLeft:'auto', display:'flex', gap:6, marginRight:4 }}>
            {(['grid','list'] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{ width:28, height:28, borderRadius:8, border:'none', background: viewMode === mode ? '#6366f1' : 'rgba(0,0,0,0.06)', color: viewMode === mode ? '#fff' : '#94a3b8', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, transition:'all 0.15s' }}>
                {mode === 'grid' ? '⊞' : '☰'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign:'center', padding:'60px 0', color:'var(--text-3)' }}>
            <div style={{ width:28, height:28, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.7s linear infinite', margin:'0 auto 12px' }} />載入中…
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
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12 }}>
            {[...filtered].sort((a,b) => new Date(a.expire_date).getTime()-new Date(b.expire_date).getTime())
              .map(item => <ItemCard key={item.inventory_id} item={item} viewMode="grid" onEdit={() => { setEditItem(item); setModal('edit'); }} onDelete={() => setDeleteConfirm(item.inventory_id)} onQuantityChange={null} />)}
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[...filtered].sort((a,b) => new Date(a.expire_date).getTime()-new Date(b.expire_date).getTime())
              .map(item => <ItemCard key={item.inventory_id} item={item} viewMode="list" onEdit={() => { setEditItem(item); setModal('edit'); }} onDelete={() => setDeleteConfirm(item.inventory_id)}
                onQuantityChange={async (delta) => {
                  const next = Math.max(1, (item.quantity ?? 1) + delta);
                  setItems(prev => prev.map(i => i.inventory_id === item.inventory_id ? { ...i, quantity: next } : i));
                  await updateInventory(item.inventory_id, { quantity: next });
                }} />)}
          </div>
        )}
        </>}
      </div>

      {/* Modals */}
      {modal === 'choice' && <AddChoiceModal onManual={() => { setPrefill(null); setModal('manual'); }} onCamera={() => setModal('image')} onClose={() => setModal(null)} />}
      {modal === 'image' && <ImageRecognizeModal onClose={() => setModal(null)} onFill={d => { setPrefill(d); setModal('manual'); }} />}
      {modal === 'manual' && <AddItemModal userId={user.user_id} prefill={prefill} cachedCategories={categories} cachedIngredients={allIngredients} onClose={() => { setModal(null); setPrefill(null); }} onAdded={loadData} />}
      {modal === 'edit' && editItem && <EditItemModal item={editItem} cachedCategories={categories} cachedIngredients={allIngredients} onClose={() => { setModal(null); setEditItem(null); }} onUpdated={loadData} />}

      {/* ── Bottom Nav ───────────────────────────────────────────── */}
      <nav style={{ position:'fixed', bottom:0, left:0, right:0, height:64, background:'var(--header-bg)', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-around', zIndex:100, boxShadow:'0 -2px 12px rgba(0,0,0,0.06)', padding:'0 16px' }}>
        {([
          { key:'home', icon:'🏠', label:'主畫面' },
          { key:'inventory', icon:'🧊', label:'食材' },
          { key:'settings', icon:'⚙️', label:'設定' },
        ] as const).map(({ key, icon, label }) => {
          const active = activeNav === key;
          return (
            <button key={key} onClick={() => setActiveNav(key)} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3, background: active ? 'rgba(99,102,241,0.12)' : 'none', border:'none', cursor:'pointer', padding:'7px 24px', borderRadius:14, transition:'background 0.15s', flex:1, maxWidth:100 }}>
              <span style={{ fontSize:22, filter: active ? 'none' : 'grayscale(1) opacity(0.45)', transition:'filter 0.15s' }}>{icon}</span>
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
    </div>
  );
}

function ItemCard({ item, viewMode, onEdit, onDelete, onQuantityChange }: { item: EnrichedItem; viewMode: 'grid'|'list'; onEdit: ()=>void; onDelete: ()=>void; onQuantityChange: ((delta: number) => void) | null }) {
  const days = getDaysLeft(item.expire_date);
  const [hovered, setHovered] = useState(false);
  const photo = localStorage.getItem(`fridge_photo_product_${item.inventory_id}`);

  const barColor = days < 0 ? '#ef4444' : days <= 2 ? '#f59e0b' : days <= 7 ? '#eab308' : '#22c55e';
  const dayLabel = days < 0 ? `已過期 ${Math.abs(days)} 天` : days === 0 ? '今天到期' : `剩 ${days} 天`;

  const cardBase: React.CSSProperties = {
    background:'var(--surface)', border:'1.5px solid var(--border)',
    boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow)',
    transition:'box-shadow 0.15s, transform 0.15s',
    transform: hovered ? 'translateY(-2px)' : 'none',
    cursor:'pointer', overflow:'hidden', position:'relative',
  };

  const imgContent = photo
    ? <img src={photo} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
    : <span style={{ fontSize: viewMode === 'grid' ? 48 : 28 }}>{CATEGORY_ICONS[item.categoryName ?? ''] ?? '📦'}</span>;

  if (viewMode === 'grid') {
    return (
      <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onClick={onEdit} style={{ ...cardBase, borderRadius:16, display:'flex', flexDirection:'column' }}>
        {/* Image */}
        <div style={{ height:130, background:'var(--surface-2)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', position:'relative', flexShrink:0 }}>
          {imgContent}
          <button onClick={e => { e.stopPropagation(); onDelete(); }}
            style={{ position:'absolute', top:6, right:6, width:26, height:26, borderRadius:7, border:'none', background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)', cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', opacity: hovered ? 1 : 0, transition:'opacity 0.15s' }}>🗑️</button>
        </div>
        {/* Info */}
        <div style={{ flex:1, padding:'8px 10px 10px', display:'flex', flexDirection:'column', justifyContent:'space-between', minHeight:0 }}>
          <div style={{ fontWeight:700, fontSize:13, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {item.ingredient_name ?? `食材 #${item.ingredient_id}`}
          </div>
          <div>
            <div style={{ fontSize:11, color: barColor, fontWeight:600 }}>{dayLabel}</div>
            <div style={{ fontSize:10, color:'var(--text-3)', marginTop:2 }}>{item.expire_date}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onClick={onEdit} style={{ ...cardBase, borderRadius:12, display:'flex', alignItems:'center', gap:12, padding:'10px 14px' }}>
      <div style={{ width:52, height:52, borderRadius:10, background:'var(--surface-2)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0 }}>
        {imgContent}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:700, fontSize:14, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {item.ingredient_name ?? `食材 #${item.ingredient_id}`}
        </div>
        <div style={{ fontSize:12, color:'var(--text-3)', marginTop:2 }}>
          {item.categoryName ?? '未分類'} · 數量 {item.quantity} · 到期 {item.expire_date}
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <span style={{ fontSize:12, color: barColor, fontWeight:600, whiteSpace:'nowrap' }}>{dayLabel}</span>
        {onQuantityChange && (
          <div onClick={e => e.stopPropagation()} style={{ display:'flex', alignItems:'center', gap:4, background:'var(--surface-2)', borderRadius:8, padding:'2px 4px' }}>
            <button onClick={() => onQuantityChange(-1)}
              style={{ width:22, height:22, borderRadius:6, border:'none', background:'none', cursor:'pointer', fontSize:16, fontWeight:700, color:'var(--text-2)', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>−</button>
            <span style={{ fontSize:13, fontWeight:700, color:'var(--text)', minWidth:16, textAlign:'center' }}>{item.quantity ?? 1}</span>
            <button onClick={() => onQuantityChange(+1)}
              style={{ width:22, height:22, borderRadius:6, border:'none', background:'none', cursor:'pointer', fontSize:16, fontWeight:700, color:'var(--text-2)', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>＋</button>
          </div>
        )}
        <button onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{ width:28, height:28, borderRadius:7, border:'none', background:'var(--surface-2)', cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', opacity: hovered ? 1 : 0.35, transition:'opacity 0.15s' }}>🗑️</button>
      </div>
    </div>
  );
}

// ── Shared styles (used by modals) ───────────────────────────────
export const overlay: React.CSSProperties = { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16 };
export const modalStyle: React.CSSProperties = { background:'var(--surface)', borderRadius:20, padding:28, width:'100%', maxWidth:460, boxShadow:'0 24px 64px rgba(0,0,0,0.25)', animation:'fadeIn 0.15s ease' };
export const modalTitle: React.CSSProperties = { fontSize:18, fontWeight:800, color:'var(--text)', margin:'0 0 20px' };
export const cancelBtn: React.CSSProperties = { flex:1, padding:11, borderRadius:10, border:'1.5px solid var(--border)', background:'var(--surface-2)', color:'var(--text-2)', fontWeight:600, cursor:'pointer', fontSize:14 };
export const saveBtn: React.CSSProperties = { flex:1, padding:11, borderRadius:10, border:'none', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', fontWeight:700, cursor:'pointer', fontSize:14 };
export const fieldStyle: React.CSSProperties = { marginBottom:14 };
export const labelStyle: React.CSSProperties = { display:'block', fontSize:13, fontWeight:600, color:'var(--text-2)', marginBottom:6 };
export const inputStyle: React.CSSProperties = { width:'100%', padding:'10px 14px', borderRadius:10, border:'1.5px solid var(--border)', fontSize:14, outline:'none', boxSizing:'border-box', background:'var(--surface-2)', color:'var(--text)' };
