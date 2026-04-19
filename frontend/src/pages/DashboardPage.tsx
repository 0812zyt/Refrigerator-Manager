import { useCallback, useEffect, useRef, useState } from 'react';
import { getInventory, deleteInventory, getCategories, getIngredients } from '../api/client';
import type { InventoryItem, Category, Ingredient, User } from '../api/types';
import { useTheme } from '../context/ThemeContext';
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
  return Math.ceil((new Date(d).getTime() - t.getTime()) / 86400000);
};

function ExpiryBadge({ days }: { days: number }) {
  const [bg, color, label] =
    days < 0  ? ['#fee2e2','#dc2626','已過期'] :
    days === 0 ? ['#ffedd5','#ea580c','今天到期'] :
    days <= 2  ? ['#fef3c7','#d97706',`${days}天後到期`] :
    days <= 7  ? ['#fef9c3','#ca8a04',`${days}天後到期`] :
                 ['#dcfce7','#16a34a',`${days}天後到期`];
  return <span style={{ background:bg, color, borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:700, whiteSpace:'nowrap' }}>{label}</span>;
}

type ModalState = null | 'choice' | 'manual' | 'image' | 'edit';
interface EnrichedItem extends InventoryItem { categoryName?: string; }

// ── Settings Popover ─────────────────────────────────────────────
function SettingsPopover({ onClose }: { onClose: () => void }) {
  const { theme, setTheme } = useTheme();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} style={{ position:'absolute', top:'calc(100% + 8px)', right:0, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:16, width:200, boxShadow:'var(--shadow-md)', zIndex:200, animation:'fadeIn 0.15s ease' }}>
      <p style={{ fontSize:12, fontWeight:700, color:'var(--text-3)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>外觀</p>
      {(['light','dark'] as const).map(t => (
        <button key={t} onClick={() => setTheme(t)} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'8px 10px', borderRadius:8, border:'none', background: theme === t ? 'var(--accent-bg)' : 'transparent', color: theme === t ? 'var(--accent)' : 'var(--text-2)', cursor:'pointer', fontSize:14, fontWeight: theme === t ? 700 : 400, marginBottom:2 }}>
          <span>{t === 'light' ? '☀️' : '🌙'}</span>
          {t === 'light' ? '淺色模式' : '深色模式'}
          {theme === t && <span style={{ marginLeft:'auto', fontSize:10 }}>✓</span>}
        </button>
      ))}
    </div>
  );
}

export default function DashboardPage({ user, onLogout }: Props) {
  const [items, setItems]           = useState<EnrichedItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab]   = useState<'list'|'alerts'>('list');
  const [modal, setModal]           = useState<ModalState>(null);
  const [editItem, setEditItem]     = useState<EnrichedItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [prefill, setPrefill]       = useState<{name?:string;category?:string}|null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, cats, ings] = await Promise.all([getInventory(user.user_id), getCategories(), getIngredients()]);
      setCategories(cats);
      const ingMap: Record<number, Ingredient> = {};
      ings.forEach(i => { ingMap[i.ingredient_id] = i; });
      const catMap: Record<number, string> = {};
      cats.forEach(c => { catMap[c.category_id] = c.category_name; });
      setItems(inv.map(item => ({
        ...item,
        ingredient_name: item.ingredient_name ?? ingMap[item.ingredient_id]?.name ?? null,
        categoryName: ingMap[item.ingredient_id]?.category_id != null ? catMap[ingMap[item.ingredient_id].category_id!] ?? undefined : undefined,
      })));
    } catch { /**/ }
    setLoading(false);
  }, [user.user_id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = async (id: number) => { await deleteInventory(id); setDeleteConfirm(null); loadData(); };

  const filtered = items.filter(i =>
    (activeCategory === '全部' || i.categoryName === activeCategory) &&
    (!searchTerm || (i.ingredient_name ?? '').toLowerCase().includes(searchTerm.toLowerCase()))
  );
  const expiringSoon = items.filter(i => getDaysLeft(i.expire_date) <= 3)
    .sort((a, b) => getDaysLeft(a.expire_date) - getDaysLeft(b.expire_date));
  const expired = items.filter(i => getDaysLeft(i.expire_date) < 0);

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <header style={{ background:'var(--header-bg)', borderBottom:'1px solid var(--border)', height:56, display:'flex', alignItems:'center', padding:'0 24px', position:'sticky', top:0, zIndex:100, boxShadow:'var(--shadow)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:30, height:30, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>🧊</div>
          <span style={{ fontWeight:800, fontSize:17, color:'var(--text)', letterSpacing:-0.3 }}>冰箱管家</span>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px', background:'var(--surface-2)', borderRadius:20 }}>
            <div style={{ width:22, height:22, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11, fontWeight:700 }}>
              {user.username[0].toUpperCase()}
            </div>
            <span style={{ fontSize:13, fontWeight:600, color:'var(--text-2)' }}>{user.username}</span>
          </div>
          {/* Settings button */}
          <div style={{ position:'relative' }}>
            <button onClick={() => setShowSettings(s => !s)} style={{ width:34, height:34, borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text-2)', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }} title="設定">⚙️</button>
            {showSettings && <SettingsPopover onClose={() => setShowSettings(false)} />}
          </div>
          <button onClick={onLogout} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text-2)', fontSize:13, cursor:'pointer', fontWeight:500 }}>登出</button>
        </div>
      </header>

      {/* ── Alert Banner ────────────────────────────────────────── */}
      {expiringSoon.length > 0 && (
        <div style={{ background:'#fffbeb', borderBottom:'1px solid #fde68a', padding:'10px 24px', display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#92400e' }}>
          ⚠️ 有 <b>{expiringSoon.length}</b> 樣食材即將到期或已過期
          <button onClick={() => setActiveTab('alerts')} style={{ marginLeft:'auto', background:'none', border:'none', color:'#b45309', fontWeight:700, cursor:'pointer', fontSize:13 }}>查看提醒 →</button>
        </div>
      )}

      <div style={{ maxWidth:1100, margin:'0 auto', padding:'24px 20px' }}>

        {/* ── Stats Row ───────────────────────────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12, marginBottom:24 }}>
          {[
            { label:'總食材', value:items.length, color:'#6366f1', bg:'var(--accent-bg)', icon:'🧊' },
            { label:'本週到期', value:items.filter(i=>{ const d=getDaysLeft(i.expire_date); return d>=0&&d<=7; }).length, color:'#f59e0b', bg:'#fffbeb', icon:'⏰' },
            { label:'已過期', value:expired.length, color:'#ef4444', bg:'#fff1f2', icon:'⚠️' },
            { label:'分類數', value:categories.length, color:'#22c55e', bg:'#f0fdf4', icon:'📂' },
          ].map(s => (
            <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'16px 18px', boxShadow:'var(--shadow)' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:12, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.04em' }}>{s.label}</span>
                <span style={{ fontSize:18 }}>{s.icon}</span>
              </div>
              <div style={{ fontSize:28, fontWeight:800, color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────── */}
        <div style={{ display:'flex', gap:4, marginBottom:20, background:'var(--surface-2)', borderRadius:12, padding:4, width:'fit-content' }}>
          {[{key:'list',label:'📋 食材清單'},{key:'alerts',label:`🔔 到期提醒${expiringSoon.length>0?` (${expiringSoon.length})`:''}`}].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as 'list'|'alerts')}
              style={{ padding:'7px 18px', borderRadius:9, border:'none', fontSize:13, fontWeight:600, cursor:'pointer', transition:'all 0.15s',
                background: activeTab === t.key ? 'var(--surface)' : 'transparent',
                color: activeTab === t.key ? 'var(--accent)' : 'var(--text-3)',
                boxShadow: activeTab === t.key ? 'var(--shadow)' : 'none',
              }}>{t.label}</button>
          ))}
        </div>

        {activeTab === 'list' && (
          <>
            {/* Toolbar */}
            <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:200, position:'relative' }}>
                <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--text-3)', fontSize:14 }}>🔍</span>
                <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  placeholder="搜尋食材名稱…"
                  style={{ width:'100%', paddingLeft:36, paddingRight:12, paddingTop:9, paddingBottom:9, borderRadius:10, border:'1.5px solid var(--border)', background:'var(--surface)', color:'var(--text)', fontSize:14, outline:'none', boxSizing:'border-box' }} />
              </div>
              <button onClick={() => setModal('choice')} style={{ padding:'9px 18px', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', boxShadow:'0 2px 8px rgba(99,102,241,0.35)' }}>
                ＋ 新增食材
              </button>
            </div>

            {/* Category filter */}
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
              {['全部', ...categories.map(c => c.category_name)].map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)} style={{
                  padding:'5px 13px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer', transition:'all 0.15s', border:'none',
                  background: activeCategory === cat ? 'var(--accent)' : 'var(--surface-2)',
                  color: activeCategory === cat ? '#fff' : 'var(--text-2)',
                }}>
                  {cat !== '全部' ? (CATEGORY_ICONS[cat] ?? '📦') + ' ' : ''}{cat}
                </button>
              ))}
            </div>

            <p style={{ color:'var(--text-3)', fontSize:12, marginBottom:14 }}>共 {filtered.length} 項食材</p>

            {loading ? (
              <div style={{ textAlign:'center', padding:'60px 0', color:'var(--text-3)' }}>
                <div style={{ width:28, height:28, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.7s linear infinite', margin:'0 auto 12px' }} />載入中…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 0', color:'var(--text-3)' }}>
                <div style={{ fontSize:40, marginBottom:8 }}>🫙</div>沒有找到食材
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}>
                {[...filtered].sort((a,b) => new Date(a.expire_date).getTime()-new Date(b.expire_date).getTime())
                  .map(item => <ItemCard key={item.inventory_id} item={item} onEdit={() => { setEditItem(item); setModal('edit'); }} onDelete={() => setDeleteConfirm(item.inventory_id)} />)}
              </div>
            )}
          </>
        )}

        {activeTab === 'alerts' && (
          <>
            <h2 style={{ fontSize:16, fontWeight:700, color:'var(--text)', marginBottom:16 }}>🔔 到期提醒</h2>
            {expiringSoon.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 0', color:'var(--text-3)' }}>
                <div style={{ fontSize:40, marginBottom:8 }}>✅</div>目前沒有即將到期的食材，太棒了！
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}>
                {expiringSoon.map(item => <ItemCard key={item.inventory_id} item={item} onEdit={() => { setEditItem(item); setModal('edit'); setActiveTab('list'); }} onDelete={() => setDeleteConfirm(item.inventory_id)} />)}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {modal === 'choice' && <AddChoiceModal onManual={() => { setPrefill(null); setModal('manual'); }} onCamera={() => setModal('image')} onClose={() => setModal(null)} />}
      {modal === 'image' && <ImageRecognizeModal onClose={() => setModal(null)} onFill={d => { setPrefill(d); setModal('manual'); }} />}
      {modal === 'manual' && <AddItemModal userId={user.user_id} prefill={prefill} onClose={() => { setModal(null); setPrefill(null); }} onAdded={loadData} />}
      {modal === 'edit' && editItem && <EditItemModal item={editItem} onClose={() => { setModal(null); setEditItem(null); }} onUpdated={loadData} />}

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

function ItemCard({ item, onEdit, onDelete }: { item: EnrichedItem; onEdit: ()=>void; onDelete: ()=>void }) {
  const days = getDaysLeft(item.expire_date);
  const urgent = days <= 2;
  const [hovered, setHovered] = useState(false);

  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background:'var(--surface)', borderRadius:14, padding:16, boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow)', border:`1.5px solid ${urgent ? '#fca5a5' : 'var(--border)'}`, transition:'box-shadow 0.15s', position:'relative', overflow:'hidden' }}>
      {urgent && <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background: days < 0 ? '#ef4444' : '#f59e0b' }} />}
      <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:12 }}>
        <div style={{ width:42, height:42, borderRadius:12, background:'var(--surface-2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>
          {CATEGORY_ICONS[item.categoryName ?? ''] ?? '📦'}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:15, color:'var(--text)', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {item.ingredient_name ?? `食材 #${item.ingredient_id}`}
          </div>
          <div style={{ fontSize:12, color:'var(--text-3)' }}>
            {item.categoryName ?? '未分類'} · 數量 {item.quantity}
          </div>
        </div>
        <div style={{ display:'flex', gap:4, opacity: hovered ? 1 : 0.4, transition:'opacity 0.15s' }}>
          <button onClick={onEdit} style={{ width:28, height:28, borderRadius:7, border:'none', background:'var(--surface-2)', cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' }}>✏️</button>
          <button onClick={onDelete} style={{ width:28, height:28, borderRadius:7, border:'none', background:'var(--surface-2)', cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' }}>🗑️</button>
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:10, borderTop:'1px solid var(--border)' }}>
        <span style={{ fontSize:12, color:'var(--text-3)' }}>到期 {item.expire_date}</span>
        <ExpiryBadge days={days} />
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
