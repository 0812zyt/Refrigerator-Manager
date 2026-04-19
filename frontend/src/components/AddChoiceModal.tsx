import { overlay, modalStyle, modalTitle, cancelBtn } from '../pages/DashboardPage';

interface Props {
  onManual: () => void;
  onCamera: () => void;
  onClose: () => void;
}

export default function AddChoiceModal({ onManual, onCamera, onClose }: Props) {
  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...modalStyle, maxWidth:360, textAlign:'center' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ ...modalTitle, textAlign:'center' }}>新增食材</h2>
        <p style={{ color:'#64748b', fontSize:13, marginBottom:24 }}>請選擇新增方式</p>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <button style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 18px', borderRadius:14, border:'2px solid var(--accent)', background:'var(--accent-bg)', cursor:'pointer', width:'100%', textAlign:'left' }} onClick={onManual}>
            <span style={{ fontSize:28 }}>✏️</span>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:'#0c4a6e' }}>手動輸入</div>
              <div style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>自行填寫食材資料</div>
            </div>
          </button>
          <button style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 18px', borderRadius:14, border:'2px solid #c4b5fd', background:'#faf5ff', cursor:'pointer', width:'100%', textAlign:'left' }} onClick={onCamera}>
            <span style={{ fontSize:28 }}>📷</span>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:'#5b21b6' }}>影像辨識</div>
              <div style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>拍照或上傳照片，AI 自動辨識</div>
            </div>
          </button>
        </div>
        <button style={{ ...cancelBtn, marginTop:16, width:'100%' }} onClick={onClose}>取消</button>
      </div>
    </div>
  );
}
