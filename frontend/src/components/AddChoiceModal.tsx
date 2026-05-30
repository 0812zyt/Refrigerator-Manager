import { overlay, modalStyle, modalTitle, cancelBtn } from '../pages/DashboardPage';

interface Props {
  onManual: () => void;
  onCamera: () => void;
  onBarcode: () => void;
  onClose: () => void;
}

export default function AddChoiceModal({ onManual, onCamera, onBarcode, onClose }: Props) {
  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...modalStyle, maxWidth:360, textAlign:'center' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ ...modalTitle, textAlign:'center' }}>新增食材</h2>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <button style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 18px', borderRadius:14, border:'2px solid var(--accent)', background:'var(--accent-bg)', cursor:'pointer', width:'100%', textAlign:'left' }} onClick={onManual}>
            <span style={{ fontSize:28 }}>✏️</span>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:'#0c4a6e' }}>手動輸入</div>
            </div>
          </button>
          <button style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 18px', borderRadius:14, border:'2px solid #c4b5fd', background:'#faf5ff', cursor:'pointer', width:'100%', textAlign:'left' }} onClick={onCamera}>
            <span style={{ fontSize:28 }}>📷</span>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:'#5b21b6' }}>影像辨識</div>
            </div>
          </button>
          <button style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 18px', borderRadius:14, border:'2px solid #86efac', background:'#f0fdf4', cursor:'pointer', width:'100%', textAlign:'left' }} onClick={onBarcode}>
            <span style={{ fontSize:28 }}>📊</span>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:'#166534' }}>條碼掃描</div>
            </div>
          </button>
        </div>
        <button style={{ ...cancelBtn, marginTop:16, width:'100%' }} onClick={onClose}>取消</button>
      </div>
    </div>
  );
}
