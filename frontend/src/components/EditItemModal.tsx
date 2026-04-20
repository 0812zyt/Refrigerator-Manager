import { useRef, useState } from 'react';
import { updateInventory } from '../api/client';
import type { InventoryItem } from '../api/types';
import { overlay, modalStyle, modalTitle, cancelBtn, saveBtn, fieldStyle, labelStyle, inputStyle } from '../pages/DashboardPage';

interface Props {
  item: InventoryItem;
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
  flex: 1, border: '2px dashed #e2e8f0', borderRadius: 12,
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', padding: 12, cursor: 'pointer',
  background: '#f8fafc', minHeight: 120, position: 'relative', overflow: 'hidden',
};

function PhotoPickerSheet({ onFile, onClose }: {
  onFile: (file: File) => void;
  onClose: () => void;
}) {
  const rowStyle: React.CSSProperties = {
    display: 'block', width: '100%', padding: '16px', border: 'none', background: 'none',
    fontSize: 16, cursor: 'pointer', color: '#1e293b', borderBottom: '1px solid #f1f5f9',
    textAlign: 'center',
  };
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
        <button style={{ ...rowStyle, color: '#ef4444', borderBottom: 'none' }} onClick={onClose}>取消</button>
      </div>
    </div>
  );
}

export default function EditItemModal({ item, onClose, onUpdated }: Props) {
  const id = item.inventory_id;
  const [quantity, setQuantity]     = useState(String(item.quantity));
  const [expireDate, setExpireDate] = useState(item.expire_date);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [productPhoto, setProductPhoto] = useState<string | null>(() => loadPhoto(id, 'product'));
  const [expirePhoto, setExpirePhoto]   = useState<string | null>(() => loadPhoto(id, 'expire'));
  const [picker, setPicker] = useState<null | 'product' | 'expire'>(null);

  const activeType = useRef<'product' | 'expire'>('product');

  const handleFile = (file: File | null, type: 'product' | 'expire') => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target!.result as string;
      savePhoto(id, type, dataUrl);
      if (type === 'product') setProductPhoto(dataUrl);
      else setExpirePhoto(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const openPicker = (type: 'product' | 'expire') => {
    activeType.current = type;
    setPicker(type);
  };

  const removePhoto = (type: 'product' | 'expire') => {
    savePhoto(id, type, null);
    if (type === 'product') setProductPhoto(null);
    else setExpirePhoto(null);
  };

  const handleSave = async () => {
    setError(''); setSaving(true);
    try {
      await updateInventory(id, {
        quantity: Math.max(1, Number(quantity) || 1),
        expire_date: expireDate,
        custom_expire: true,
      });
      onUpdated(); onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '更新失敗');
    } finally { setSaving(false); }
  };

  const PhotoPanel = ({ type, photo, label, sub }: { type: 'product' | 'expire'; photo: string | null; label: string; sub: string }) => (
    <div style={panelStyle} onClick={() => openPicker(type)}>
      {photo ? (
        <>
          <img src={photo} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0, borderRadius: 10 }} />
          <button onClick={e => { e.stopPropagation(); removePhoto(type); }}
            style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 12 }}>✕</button>
        </>
      ) : (
        <>
          <span style={{ fontSize: 28, color: '#94a3b8' }}>{type === 'product' ? '📷' : '📅'}</span>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 4 }}>{label}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</div>
        </>
      )}
    </div>
  );

  return (
    <>
      <div style={overlay} onClick={onClose}>
        <div style={{ ...modalStyle, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <h2 style={modalTitle}>✏️ 編輯食材</h2>

          <div style={{ background: '#f0f9ff', borderRadius: 10, padding: '8px 14px', marginBottom: 16, fontSize: 14, color: '#0369a1' }}>
            {item.ingredient_name ?? `食材 #${item.ingredient_id}`}
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
            <PhotoPanel type="product" photo={productPhoto} label="商品照片" sub="拍照自動辨識名稱" />
            <PhotoPanel type="expire" photo={expirePhoto} label="有效期限" sub="拍日期對照填寫" />
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
            <input style={inputStyle} type="date" value={expireDate} onChange={e => setExpireDate(e.target.value)} />
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
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}
