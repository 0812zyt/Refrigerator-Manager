import { useEffect, useRef, useState } from 'react';
import { updateInventory, getCategories, getIngredients, createIngredient, updateIngredient } from '../api/client';
import type { InventoryItem, Category, Ingredient } from '../api/types';
import { overlay, modalStyle, modalTitle, cancelBtn, saveBtn, fieldStyle, labelStyle, inputStyle, CAT_ZH } from '../pages/DashboardPage';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

interface Props {
  item: InventoryItem & { categoryName?: string };
  cachedCategories?: Category[];
  cachedIngredients?: Ingredient[];
  onClose: () => void;
  onUpdated: () => void;
}

function photoKey(id: number, type: 'product' | 'expire') {
  return `fridge_photo_${type}_${id}`;
}
function loadPhoto(id: number, type: 'product' | 'expire') {
  return localStorage.getItem(photoKey(id, type));
}
function savePhoto(id: number, type: 'product' | 'expire', dataUrl: string | null) {
  if (dataUrl) localStorage.setItem(photoKey(id, type), dataUrl);
  else localStorage.removeItem(photoKey(id, type));
}

const panelStyle: React.CSSProperties = {
  border: '2px dashed #e2e8f0', borderRadius: 12,
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', cursor: 'pointer',
  background: '#f8fafc', position: 'relative', overflow: 'hidden',
  width: 180, height: 180, margin: '0 auto',
};

const FOOD_STICKERS = [
  '🍎','🍊','🍋','🍇','🍓','🫐','🍑','🍒','🥭','🍍',
  '🥦','🥕','🌽','🍆','🧅','🧄','🥔','🍅','🥑','🫛',
  '🥩','🍗','🥚','🧀','🥛','🧈','🐟','🦐','🦑','🥓',
  '🍚','🍞','🧇','🥞','🍜','🥗','🫙','🧃','🥤','🍵',
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
  onFile: (file: File) => void;
  onSticker: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const [showStickers, setShowStickers] = useState(false);
  const rowStyle: React.CSSProperties = {
    display: 'block', width: '100%', padding: '16px', border: 'none', background: 'none',
    fontSize: 16, cursor: 'pointer', color: '#1e293b', borderBottom: '1px solid #f1f5f9',
    textAlign: 'center',
  };
  if (showStickers) return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div style={{ width: '100%', background: '#fff', borderRadius: '16px 16px 0 0', paddingBottom: 32 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '12px 16px 8px', textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>選擇貼紙</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4, padding: '8px 16px 16px' }}>
          {FOOD_STICKERS.map(emoji => (
            <button key={emoji} onClick={() => { onSticker(emojiToDataUrl(emoji)); onClose(); }}
              style={{ fontSize: 28, background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8, lineHeight: 1 }}>
              {emoji}
            </button>
          ))}
        </div>
        <button style={{ ...rowStyle, color: '#ef4444', borderBottom: 'none' }} onClick={onClose}>取消</button>
      </div>
    </div>
  );
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div style={{ width: '100%', background: '#fff', borderRadius: '16px 16px 0 0', paddingBottom: 32 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '12px 16px 4px', textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>選擇照片來源</div>
        <label style={rowStyle}>
          從相冊中選擇
          <input type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) { onFile(f); onClose(); } e.target.value = ''; }} />
        </label>
        <label style={rowStyle}>
          使用相機
          <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) { onFile(f); onClose(); } e.target.value = ''; }} />
        </label>
        <button style={rowStyle} onClick={() => setShowStickers(true)}>使用貼紙</button>
        <button style={{ ...rowStyle, color: '#ef4444', borderBottom: 'none' }} onClick={onClose}>取消</button>
      </div>
    </div>
  );
}

export default function EditItemModal({ item, cachedCategories, cachedIngredients, onClose, onUpdated }: Props) {
  const id = item.inventory_id;
  const [quantity, setQuantity]     = useState(String(item.quantity));
  const [expireDate, setExpireDate] = useState(item.expire_date);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [productPhoto, setProductPhoto] = useState<string | null>(() => loadPhoto(id, 'product'));
  const [picker, setPicker] = useState<null | 'product' | 'expire'>(null);
  const [categories, setCategories] = useState<Category[]>(cachedCategories ?? []);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>(cachedIngredients ?? []);
  const [ingredients, setIngredients] = useState<Ingredient[]>(cachedIngredients ?? []);
  const [nameInput, setNameInput] = useState(item.ingredient_name ?? '');
  const [selectedIng, setSelectedIng] = useState<Ingredient | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(item.categoryName ?? '');
  const skipClearRef = useRef(false);

  const activeType = useRef<'product' | 'expire'>('product');

  useEffect(() => {
    const catsPromise = cachedCategories ? Promise.resolve(cachedCategories) : getCategories();
    const ingsPromise = cachedIngredients ? Promise.resolve(cachedIngredients) : getIngredients();
    Promise.all([catsPromise, ingsPromise]).then(([cats, all]) => {
      setCategories(cats);
      setAllIngredients(all);
      setIngredients(all);
      const match = all.find(i => i.ingredient_id === item.ingredient_id);
      if (match) {
        skipClearRef.current = true;
        setSelectedIng(match);
        if (match.category_id != null) {
          const cat = cats.find(c => c.category_id === match.category_id);
          if (cat) setSelectedCategory(cat.category_name);
        }
      }
    }).catch(() => {});
  }, [item.ingredient_id]);

  useEffect(() => {
    if (skipClearRef.current) { skipClearRef.current = false; return; }
    if (!nameInput.trim()) { setIngredients(allIngredients); setSelectedIng(null); return; }
    setIngredients(allIngredients.filter(i => i.name.toLowerCase().includes(nameInput.toLowerCase())));
    setSelectedIng(null);
  }, [nameInput, allIngredients]);

  const handleFile = (file: File | null, type: 'product' | 'expire') => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target!.result as string;
      if (type === 'product') setProductPhoto(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const openPicker = (type: 'product' | 'expire') => {
    activeType.current = type;
    setPicker(type);
  };

  const removePhoto = (type: 'product' | 'expire') => {
    if (type === 'product') setProductPhoto(null);
  };

  const handleSave = async () => {
    if (!nameInput.trim()) { setError('請輸入食材名稱'); return; }
    setError(''); setSaving(true);
    try {
      const nameUnchanged = nameInput.trim().toLowerCase() === (item.ingredient_name ?? '').toLowerCase();
      let ingredientId: number;
      if (nameUnchanged) {
        ingredientId = item.ingredient_id;
        const catEntry = categories.find(c => c.category_name === selectedCategory);
        const originalCat = categories.find(c => c.category_name === item.categoryName);
        if (catEntry && catEntry.category_id !== originalCat?.category_id) {
          await updateIngredient(ingredientId, { category_id: catEntry.category_id });
        }
      } else {
        let ing = selectedIng
          ?? allIngredients.find(i => i.name.toLowerCase() === nameInput.trim().toLowerCase())
          ?? null;
        if (!ing) {
          const catEntry = categories.find(c => c.category_name === selectedCategory);
          ing = await createIngredient({ name: nameInput.trim(), category_id: catEntry?.category_id });
        }
        ingredientId = ing.ingredient_id;
      }
      await updateInventory(id, {
        ingredient_id: ingredientId,
        quantity: Math.max(1, Number(quantity) || 1),
        expire_date: expireDate,
        custom_expire: true,
      });
      savePhoto(id, 'product', productPhoto);
      onUpdated(); onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '更新失敗');
    } finally { setSaving(false); }
  };

  const PhotoPanel = ({ type, photo, label }: { type: 'product' | 'expire'; photo: string | null; label: string }) => (
    <div style={panelStyle} onClick={() => openPicker(type)}>
      {photo ? (
        <>
          <img src={photo} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0, borderRadius: 10 }} />
          <button onClick={e => { e.stopPropagation(); removePhoto(type); }}
            style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 12 }}>✕</button>
        </>
      ) : (
        <span style={{ fontSize: 36, color: '#94a3b8' }}>📷</span>
      )}
    </div>
  );

  return (
    <>
      <div style={overlay} onClick={onClose}>
        <div style={{ ...modalStyle, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <h2 style={modalTitle}>✏️ 編輯食材</h2>

          <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
            <PhotoPanel type="product" photo={productPhoto} label="商品照片" />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>食材名稱 *</label>
            <input style={inputStyle} placeholder="輸入關鍵字搜尋或手動輸入…" value={nameInput}
              onChange={e => setNameInput(e.target.value)} />
            {nameInput && !selectedIng && ingredients.length > 0 && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 4, maxHeight: 140, overflowY: 'auto', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                {ingredients.slice(0, 6).map(ing => (
                  <div key={ing.ingredient_id} onClick={() => { skipClearRef.current = true; setSelectedIng(ing); setNameInput(ing.name); setIngredients(allIngredients); }}
                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid #f1f5f9' }}>
                    {ing.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>分類</label>
            <select style={{ ...inputStyle, appearance: 'auto' }} value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
              <option value="">尚未分類</option>
              {categories.map(c => <option key={c.category_id} value={c.category_name}>{CAT_ZH[c.category_name] ?? c.category_name}</option>)}
            </select>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>數量</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setQuantity(q => String(Math.max(1, Number(q) - 1)))}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#f8fafc', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
              <span style={{ fontSize: 16, fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{quantity}</span>
              <button onClick={() => setQuantity(q => String(Number(q) + 1))}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#f8fafc', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>＋</button>
            </div>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>到期日</label>
            <DatePicker
              selected={expireDate ? new Date(expireDate) : null}
              onChange={(date: Date | null) => setExpireDate(date ? date.toISOString().slice(0, 10) : '')}
              dateFormat="yyyy-MM-dd"
              placeholderText="yyyy-mm-dd"
              customInput={<input style={inputStyle} />}
            />
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button style={cancelBtn} onClick={onClose}>取消</button>
            <button style={{ ...saveBtn, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>
              {saving ? '儲存中…' : '儲存變更'}
            </button>
          </div>
        </div>
      </div>

      {picker && (
        <PhotoPickerSheet
          onFile={(file) => handleFile(file, activeType.current)}
          onSticker={(dataUrl) => { setProductPhoto(dataUrl); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}
