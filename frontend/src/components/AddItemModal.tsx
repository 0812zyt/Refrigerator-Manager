import { useEffect, useRef, useState } from 'react';
import { getCategories, getIngredients, createInventory, createIngredient } from '../api/client';
import type { Category, Ingredient } from '../api/types';
import { overlay, modalStyle, modalTitle, cancelBtn, saveBtn, fieldStyle, labelStyle, inputStyle } from '../pages/DashboardPage';

interface Props {
  userId: string;
  prefill?: { name?: string; category?: string } | null;
  onClose: () => void;
  onAdded: () => void;
}

export default function AddItemModal({ userId, prefill, onClose, onAdded }: Props) {
  const [categories, setCategories]   = useState<Category[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [form, setForm] = useState({ name: prefill?.name ?? '', category: prefill?.category ?? '', quantity: '1', expiry: '' });
  const [selectedIng, setSelectedIng] = useState<Ingredient | null>(null);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const skipClearRef = useRef(false);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
    getIngredients().then(all => {
      setAllIngredients(all);
      setIngredients(all);
      if (prefill?.name) {
        const match = all.find(i => i.name.toLowerCase().includes(prefill.name!.toLowerCase()));
        if (match) { skipClearRef.current = true; setSelectedIng(match); }
      }
    }).catch(() => {});
  }, [prefill]);

  useEffect(() => {
    if (skipClearRef.current) { skipClearRef.current = false; return; }
    if (!form.name.trim()) { setIngredients(allIngredients); setSelectedIng(null); return; }
    setIngredients(allIngredients.filter(i => i.name.toLowerCase().includes(form.name.toLowerCase())));
    setSelectedIng(null);
  }, [form.name, allIngredients]);

  const selectIngredient = (ing: Ingredient) => {
    skipClearRef.current = true;
    setSelectedIng(ing);
    setForm(f => ({ ...f, name: ing.name }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('請輸入食材名稱'); return; }
    if (!form.expiry)      { setError('請選擇到期日'); return; }
    setError(''); setSaving(true);
    try {
      // 找現有食材，找不到就自動建立
      let ing = selectedIng
        ?? allIngredients.find(i => i.name.toLowerCase() === form.name.trim().toLowerCase())
        ?? allIngredients.find(i => i.name.toLowerCase().includes(form.name.trim().toLowerCase()))
        ?? null;
      if (!ing) {
        const catEntry = categories.find(c => c.category_name === form.category);
        ing = await createIngredient({ name: form.name.trim(), category_id: catEntry?.category_id });
      }
      await createInventory({
        user_id: userId,
        ingredient_id: ing.ingredient_id,
        quantity: Math.max(1, Number(form.quantity) || 1),
        expire_date: form.expiry,
        custom_expire: true,
      });
      onAdded(); onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '新增失敗');
    } finally { setSaving(false); }
  };

  const CATEGORY_ICONS: Record<string, string> = {
    蔬菜:'🥬', 水果:'🍎', 肉類:'🥩', 乳製品:'🧀', 飲料:'🥤',
    調味料:'🧂', 冷凍食品:'🧊', 其他:'📦',
    Vegetables:'🥬', Fruits:'🍎', Meat:'🥩', Dairy:'🧀',
    Beverages:'🥤', Condiments:'🧂', Frozen:'🧊',
  };
  const catMap: Record<number, string> = {};
  categories.forEach(c => { catMap[c.category_id] = c.category_name; });

  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...modalStyle, maxHeight:'90vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
        <h2 style={modalTitle}>＋ 新增食材</h2>

        <div style={fieldStyle}>
          <label style={labelStyle}>食材名稱 *</label>
          <input style={inputStyle} placeholder="輸入關鍵字搜尋…" value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>

        {/* Ingredient suggestions */}
        {form.name && !selectedIng && ingredients.length > 0 && (
          <div style={{ border:'1.5px solid #e2e8f0', borderRadius:10, maxHeight:160, overflowY:'auto', marginBottom:14, background:'#fff' }}>
            {ingredients.slice(0, 20).map(ing => {
              const catName = ing.category_id != null ? (catMap[ing.category_id] ?? '') : '';
              return (
                <button key={ing.ingredient_id} onClick={() => selectIngredient(ing)}
                  style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'8px 14px', background:'none', border:'none', cursor:'pointer', textAlign:'left', fontSize:14, color:'#374151' }}>
                  <span>{CATEGORY_ICONS[catName] ?? '📦'}</span>
                  <span>{ing.name}</span>
                  {ing.default_expire_days && <span style={{ marginLeft:'auto', fontSize:12, color:'#94a3b8' }}>預設 {ing.default_expire_days} 天</span>}
                </button>
              );
            })}
          </div>
        )}

        {selectedIng && (
          <div style={{ background:'#f0f9ff', borderRadius:10, padding:'8px 14px', marginBottom:14, fontSize:14, color:'#0369a1', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span>✅ 已選：<strong>{selectedIng.name}</strong></span>
            <button onClick={() => { setSelectedIng(null); setForm(f => ({ ...f, name:'' })); }} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:16 }}>✕</button>
          </div>
        )}

        <div style={fieldStyle}>
          <label style={labelStyle}>分類</label>
          <select style={inputStyle} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            <option value="">全部分類</option>
            {categories.map(c => <option key={c.category_id} value={c.category_name}>{CATEGORY_ICONS[c.category_name] ?? '📦'} {c.category_name}</option>)}
          </select>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>數量</label>
          <input style={{ ...inputStyle, width:100 }} type="number" min={1} value={form.quantity}
            onChange={e => setForm({ ...form, quantity: e.target.value })} />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>到期日 *</label>
          <input style={inputStyle} type="date" value={form.expiry}
            onChange={e => setForm({ ...form, expiry: e.target.value })} />
        </div>

        {error && <p style={{ color:'#ef4444', fontSize:13, marginBottom:8 }}>{error}</p>}

        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button style={cancelBtn} onClick={onClose}>取消</button>
          <button style={{ ...saveBtn, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? '新增中…' : '新增食材'}
          </button>
        </div>
      </div>
    </div>
  );
}
