import { overlay, modalStyle, modalTitle, cancelBtn } from '../pages/DashboardPage';

interface Props {
  onManual: () => void;
  onImage: () => void;
  onBarcode: () => void;
  onClose: () => void;
}

export default function AddChoiceModal({ onManual, onImage, onBarcode, onClose }: Props) {
  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...modalStyle, maxWidth:360, textAlign:'center' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ ...modalTitle, textAlign:'center' }}>新增食材</h2>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <button style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 18px', borderRadius:14, border:'2px solid var(--accent)', background:'var(--accent-bg)', cursor:'pointer', width:'100%', textAlign:'left' }} onClick={onManual}>
            <i className="fi fi-rr-pencil" style={{ fontSize:28, color:'#0c4a6e', display:'flex', alignItems:'center' }} />
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:'#0c4a6e' }}>手動輸入</div>
            </div>
          </button>
          <button style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 18px', borderRadius:14, border:'2px solid #c4b5fd', background:'#faf5ff', cursor:'pointer', width:'100%', textAlign:'left' }} onClick={onImage}>
            <i className="fi fi-rr-camera" style={{ fontSize:28, color:'#5b21b6', display:'flex', alignItems:'center' }} />
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:'#5b21b6' }}>影像辨識</div>
            </div>
          </button>
          <button style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 18px', borderRadius:14, border:'2px solid #86efac', background:'#f0fdf4', cursor:'pointer', width:'100%', textAlign:'left' }} onClick={onBarcode}>
            <i className="fi fi-rr-barcode-read" style={{ fontSize:28, color:'#166534', display:'flex', alignItems:'center' }} />
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
