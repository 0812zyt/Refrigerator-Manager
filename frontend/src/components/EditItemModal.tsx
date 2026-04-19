import { useState } from 'react';
import { updateInventory } from '../api/client';
import type { InventoryItem } from '../api/types';
import { overlay, modalStyle, modalTitle, cancelBtn, saveBtn, fieldStyle, labelStyle, inputStyle } from '../pages/DashboardPage';

interface Props {
  item: InventoryItem;
  onClose: () => void;
  onUpdated: () => void;
}

export default function EditItemModal({ item, onClose, onUpdated }: Props) {
  const [quantity, setQuantity]     = useState(String(item.quantity));
  const [expireDate, setExpireDate] = useState(item.expire_date);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  const handleSave = async () => {
    setError(''); setSaving(true);
    try {
      await updateInventory(item.inventory_id, {
        quantity: Math.max(1, Number(quantity) || 1),
        expire_date: expireDate,
        custom_expire: true,
      });
      onUpdated(); onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '更新失敗');
    } finally { setSaving(false); }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <h2 style={modalTitle}>✏️ 編輯食材</h2>

        <div style={{ background:'#f0f9ff', borderRadius:10, padding:'8px 14px', marginBottom:16, fontSize:14, color:'#0369a1' }}>
          {item.ingredient_name ?? `食材 #${item.ingredient_id}`}
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>數量</label>
          <input style={{ ...inputStyle, width:100 }} type="number" min={1} value={quantity}
            onChange={e => setQuantity(e.target.value)} />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>到期日</label>
          <input style={inputStyle} type="date" value={expireDate}
            onChange={e => setExpireDate(e.target.value)} />
        </div>

        {error && <p style={{ color:'#ef4444', fontSize:13, marginBottom:8 }}>{error}</p>}

        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button style={cancelBtn} onClick={onClose}>取消</button>
          <button style={{ ...saveBtn, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? '儲存中…' : '儲存變更'}
          </button>
        </div>
      </div>
    </div>
  );
}
