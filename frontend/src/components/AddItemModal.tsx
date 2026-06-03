import { useEffect, useRef, useState } from 'react';
import { getCategories, getIngredients, createInventory, createIngredient } from '../api/client';
import type { Category, Ingredient } from '../api/types';
import { overlay, modalStyle, modalTitle, cancelBtn, saveBtn, fieldStyle, labelStyle, inputStyle } from '../pages/DashboardPage';
import { inferCategory } from '../utils/categoryInfer';
import { compressImage } from '../utils/imageCompress';
import CategoryIcon from './CategoryIcon';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY as string;

async function inferExpireDays(name: string): Promise<number | null> {
  if (!GROQ_KEY || !name) return null;
  try {
    const prompt = `食材「${name}」一般冷藏保存可放幾天？只回傳一個正整數（不要任何文字、單位或說明）。`;
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 8,
      }),
    });
    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content?.trim() ?? '';
    const n = parseInt(text.match(/\d+/)?.[0] ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

interface Props {
  userId: string;
  prefill?: { name?: string; category?: string; photo?: string } | null;
  cachedCategories?: Category[];
  cachedIngredients?: Ingredient[];
  onClose: () => void;
  onAdded: () => void;
}

const panelStyle: React.CSSProperties = {
  border: '2px dashed #e2e8f0', borderRadius: 12,
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', cursor: 'pointer',
  background: '#f8fafc', position: 'relative', overflow: 'hidden',
  width: 180, height: 180, margin: '0 auto',
};

const STICKER_GROUPS: { name: string; emojis: string[] }[] = [
  { name: '蔬菜',   emojis: ['🥬','🥕','🥒','🍅','🧅','🥔','🌽','🥦','🫑','🥑','🍆','🧄','🫛'] },
  { name: '水果',   emojis: ['🍎','🍌','🥝','🍑','🍈','🍇','🍓','🍊','🥭','🟣','🍍','🍋','🍒','🫐'] },
  { name: '肉類',   emojis: ['🍗','🍖','🥩','🌭','🥓'] },
  { name: '海鮮',   emojis: ['🐟','🦐','🦀','🦑','🐚'] },
  { name: '雞蛋',   emojis: ['🥚','🍳','🍮'] },
  { name: '乳製品', emojis: ['🧀','🥛','🍦','🥣','🧈'] },
  { name: '主食',   emojis: ['🍚','🍞','🍜','🍝','🥟','🧇','🥞','🥗'] },
  { name: '飲料',   emojis: ['🧃','☕','🧋','🍵','🥤','🫙'] },
];

function emojiToDataUrl(emoji: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 128, 128);
  ctx.font = '80px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 64, 68);
  return canvas.toDataURL('image/png');
}

function PhotoPickerSheet({ onFile, onSticker, onClose }: {
  onFile: (file: File, source: 'album' | 'camera') => void;
  onSticker: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const [showStickers, setShowStickers] = useState(false);
  const [stickerGroup, setStickerGroup] = useState<string | null>(null);
  const rowStyle: React.CSSProperties = {
    display: 'block', width: '100%', padding: '16px', border: 'none', background: 'none',
    fontSize: 16, cursor: 'pointer', color: '#1e293b', borderBottom: '1px solid #f1f5f9',
    textAlign: 'center',
  };
  const closeStickers = () => { setShowStickers(false); setStickerGroup(null); };
  if (showStickers) {
    const group = STICKER_GROUPS.find(g => g.name === stickerGroup);
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
        <div style={{ width: '100%', background: '#fff', borderRadius: '16px 16px 0 0', paddingBottom: 32 }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px 8px' }}>
            {group && (
              <button onClick={() => setStickerGroup(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '4px 8px', color: '#64748b' }}>‹</button>
            )}
            <div style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#334155' }}>
              {group ? group.name : '選擇貼紙分類'}
            </div>
            {group && <div style={{ width: 30 }} />}
          </div>
          {!group ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '8px 16px 16px' }}>
              {STICKER_GROUPS.map(g => (
                <button key={g.name} onClick={() => setStickerGroup(g.name)}
                  style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'12px 4px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:12, cursor:'pointer' }}>
                  <span style={{ fontSize: 32, lineHeight: 1 }}>{g.emojis[0]}</span>
                  <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{g.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, padding: '8px 16px 16px' }}>
              {group.emojis.map(emoji => (
                <button key={emoji} onClick={() => { onSticker(emojiToDataUrl(emoji)); onClose(); }}
                  style={{ fontSize: 32, background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, lineHeight: 1 }}>
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <button style={{ ...rowStyle, color: '#ef4444', borderBottom: 'none' }} onClick={closeStickers}>取消</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div style={{ width: '100%', background: '#fff', borderRadius: '16px 16px 0 0', paddingBottom: 32 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '12px 16px 4px', textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>選擇照片來源</div>
        <label style={rowStyle}>
          從相冊中選擇
          <input type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) { onFile(f, 'album'); onClose(); } e.target.value = ''; }} />
        </label>
        <label style={rowStyle}>
          使用相機
          <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) { onFile(f, 'camera'); onClose(); } e.target.value = ''; }} />
        </label>
        <button style={rowStyle} onClick={() => setShowStickers(true)}>使用貼紙</button>
        <button style={{ ...rowStyle, color: '#ef4444', borderBottom: 'none' }} onClick={onClose}>取消</button>
      </div>
    </div>
  );
}

export default function AddItemModal({ userId, prefill, cachedCategories, cachedIngredients, onClose, onAdded }: Props) {
  const [categories, setCategories]   = useState<Category[]>(cachedCategories ?? []);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>(cachedIngredients ?? []);
  const [ingredients, setIngredients] = useState<Ingredient[]>(cachedIngredients ?? []);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ name: prefill?.name ?? '', category: prefill?.category ?? '', quantity: '1', expiry: '', purchaseDate: today });
  const [selectedIng, setSelectedIng] = useState<Ingredient | null>(null);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [productPhoto, setProductPhoto] = useState<string | null>(prefill?.photo ?? null);
  const [expirePhoto, setExpirePhoto]   = useState<string | null>(null);
  const [picker, setPicker] = useState<null | 'product' | 'expire'>(null);
  const skipClearRef = useRef(false);
  const activeType = useRef<'product' | 'expire'>('product');

  useEffect(() => {
    if (!cachedCategories) getCategories().then(setCategories).catch(() => {});
    const ingsPromise = cachedIngredients ? Promise.resolve(cachedIngredients) : getIngredients();
    ingsPromise.then(all => {
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

  const handleFile = (file: File | null, type: 'product' | 'expire') => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
      const raw = e.target!.result as string;
      const compressed = await compressImage(raw, 800, 0.7);
      console.log('[upload]', type, 'raw:', raw.length, '→', compressed.length);
      if (type === 'product') setProductPhoto(compressed);
      else setExpirePhoto(compressed);
    };
    reader.readAsDataURL(file);
  };

  const openPicker = (type: 'product' | 'expire') => {
    activeType.current = type;
    setPicker(type);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('請輸入食材名稱'); return; }
    setError(''); setSaving(true);
    try {
      let ing = selectedIng
        ?? allIngredients.find(i => i.name.toLowerCase() === form.name.trim().toLowerCase())
        ?? allIngredients.find(i => i.name.toLowerCase().includes(form.name.trim().toLowerCase()))
        ?? null;
      const needAiDays = !form.expiry && !ing?.default_expire_days;
      const aiDaysPromise = needAiDays
        ? inferExpireDays(ing?.name ?? form.name.trim())
        : Promise.resolve(null);
      if (!ing) {
        let catEntry = form.category
          ? categories.find(c => c.category_name === form.category)
          : null;
        if (!catEntry) {
          const inferred = await inferCategory(form.name.trim(), categories);
          if (inferred) catEntry = inferred;
        }
        catEntry = catEntry ?? categories.find(c => c.category_name === 'Others' || c.category_name === '其他');
        const aiDays = await aiDaysPromise;
        ing = await createIngredient({
          name: form.name.trim(),
          category_id: catEntry?.category_id,
          ...(aiDays ? { default_expire_days: aiDays } : {}),
        });
      }
      let expireDate = form.expiry;
      if (!expireDate) {
        const days = ing.default_expire_days ?? (await aiDaysPromise) ?? 7;
        expireDate = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
      }
      const created = await createInventory({
        user_id: userId,
        ingredient_id: ing.ingredient_id,
        quantity: Math.max(1, Number(form.quantity) || 1),
        added_date: form.purchaseDate || today,
        expire_date: expireDate,
        custom_expire: !!form.expiry,
      });
      // 新增成功後，把照片存進 localStorage
      const newId = created.inventory_id;
      if (productPhoto) localStorage.setItem(`fridge_photo_product_${newId}`, productPhoto);
      if (expirePhoto)  localStorage.setItem(`fridge_photo_expire_${newId}`, expirePhoto);
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

  const PhotoPanel = ({ type, photo, label }: { type: 'product' | 'expire'; photo: string | null; label: string }) => (
    <div style={panelStyle} onClick={() => openPicker(type)}>
      {photo ? (
        <>
          <img src={photo} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0, borderRadius: 10 }} />
          <button onClick={e => { e.stopPropagation(); type === 'product' ? setProductPhoto(null) : setExpirePhoto(null); }}
            style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 12 }}>✕</button>
        </>
      ) : (
        <i className={`fi ${type === 'product' ? 'fi-rr-camera' : 'fi-rr-calendar'}`} style={{ fontSize: 36, color: '#94a3b8', display:'flex', alignItems:'center' }} />
      )}
    </div>
  );

  return (
    <>
      <div style={overlay} onClick={onClose}>
        <div style={{ ...modalStyle, maxHeight:'90vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
          <h2 style={modalTitle}>＋ 新增食材</h2>

          <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
            <PhotoPanel type="product" photo={productPhoto} label="商品照片" />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>食材名稱 *</label>
            <input style={{ ...inputStyle, textAlign: 'center' }} placeholder="輸入關鍵字搜尋或手動輸入…" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>

          {form.name && !selectedIng && ingredients.length > 0 && (
            <div style={{ border:'1.5px solid #e2e8f0', borderRadius:10, maxHeight:160, overflowY:'auto', marginBottom:14, background:'#fff' }}>
              {ingredients.slice(0, 20).map(ing => {
                const catName = ing.category_id != null ? (catMap[ing.category_id] ?? '') : '';
                return (
                  <button key={ing.ingredient_id} onClick={() => selectIngredient(ing)}
                    style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'8px 14px', background:'none', border:'none', cursor:'pointer', textAlign:'left', fontSize:14, color:'#374151' }}>
                    <CategoryIcon name={catName} size={18} />
                    <span>{ing.name}</span>
                    {ing.default_expire_days && <span style={{ marginLeft:'auto', fontSize:12, color:'#94a3b8' }}>預設 {ing.default_expire_days} 天</span>}
                  </button>
                );
              })}
            </div>
          )}


          <div style={fieldStyle}>
            <label style={labelStyle}>分類</label>
            <select style={{ ...inputStyle, textAlign: 'center', color: form.category ? undefined : '#94a3b8' }} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              <option value="">未選擇將自動分類</option>
              {categories.map(c => <option key={c.category_id} value={c.category_name}>{CATEGORY_ICONS[c.category_name] ?? '📦'} {c.category_name}</option>)}
            </select>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>數量</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setForm(f => ({ ...f, quantity: String(Math.max(1, Number(f.quantity) - 1)) }))}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#f8fafc', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
              <span style={{ fontSize: 16, fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{form.quantity}</span>
              <button onClick={() => setForm(f => ({ ...f, quantity: String(Number(f.quantity) + 1) }))}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#f8fafc', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>＋</button>
            </div>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>購入日期</label>
            <DatePicker
              selected={form.purchaseDate ? new Date(form.purchaseDate) : null}
              onChange={(date: Date | null) => setForm({ ...form, purchaseDate: date ? date.toISOString().slice(0, 10) : today })}
              dateFormat="yyyy-MM-dd"
              placeholderText="yyyy-mm-dd"
              customInput={<input style={{ ...inputStyle, textAlign: 'center' }} />}
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>到期日</label>
            <DatePicker
              selected={form.expiry ? new Date(form.expiry) : null}
              onChange={(date: Date | null) => setForm({ ...form, expiry: date ? date.toISOString().slice(0, 10) : '' })}
              dateFormat="yyyy-MM-dd"
              placeholderText="未填寫將自動判斷"
              customInput={<input style={{ ...inputStyle, textAlign: 'center' }} />}
            />
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

      {picker && (
        <PhotoPickerSheet
          onFile={(file) => handleFile(file, activeType.current)}
          onSticker={(dataUrl) => { activeType.current === 'product' ? setProductPhoto(dataUrl) : setExpirePhoto(dataUrl); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}
