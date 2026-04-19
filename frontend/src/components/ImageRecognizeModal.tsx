import { useCallback, useRef, useState } from 'react';
import { overlay, modalStyle, modalTitle, cancelBtn, saveBtn } from '../pages/DashboardPage';

interface RecognizeResult {
  name: string;
  category?: string;
  quantity?: string;
  note?: string;
}

interface Props {
  onClose: () => void;
  onFill: (data: { name: string; category?: string }) => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  蔬菜:'🥬', 水果:'🍎', 肉類:'🥩', 乳製品:'🧀', 飲料:'🥤',
  調味料:'🧂', 冷凍食品:'🧊', 其他:'📦',
};

export default function ImageRecognizeModal({ onClose, onFill }: Props) {
  const [mode, setMode]         = useState<'choose' | 'camera' | 'preview'>('choose');
  const [imgSrc, setImgSrc]     = useState<string | null>(null);
  const [imgBase64, setImgBase64] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [results, setResults]   = useState<RecognizeResult[] | null>(null);
  const [error, setError]       = useState('');
  const [camError, setCamError] = useState('');

  const fileRef   = useRef<HTMLInputElement>(null);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    setCamError(''); setMode('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setCamError('無法存取相機，請確認已授予相機權限，或改用上傳方式。');
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const capture = () => {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg');
    setImgSrc(dataUrl); setImgBase64(dataUrl.split(',')[1]);
    stopCamera(); setMode('preview');
  };

  const handleFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const result = e.target!.result as string;
      setImgSrc(result); setImgBase64(result.split(',')[1]);
      setResults(null); setError(''); setMode('preview');
    };
    reader.readAsDataURL(file);
  };

  const reset = () => { stopCamera(); setImgSrc(null); setImgBase64(null); setResults(null); setError(''); setMode('choose'); };
  const handleClose = () => { stopCamera(); onClose(); };

  const recognize = async () => {
    if (!imgBase64) return;
    setLoading(true); setError(''); setResults(null);
    try {
      const res = await fetch('https://smartfridge-f6b6.onrender.com/api/v1/system/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: imgBase64 }),
      });
      const data = await res.json();
      if (data.status === 'success' && data.data?.label) {
        setResults([{ name: data.data.label, category: '其他', quantity: '', note: '' }]);
      } else {
        setError('辨識信心度不足，請手動輸入或重新拍照。');
      }
    } catch {
      setError('辨識失敗，請確認圖片清晰或再試一次。');
    }
    setLoading(false);
  };

  const srcBtn = (color: string, bg: string): React.CSSProperties => ({
    display:'flex', flexDirection:'column', alignItems:'center', gap:6,
    padding:'20px 12px', borderRadius:14, border:`2px solid ${color}`,
    background:bg, cursor:'pointer', flex:1, textAlign:'center', fontSize:13, color,
  });

  return (
    <div style={overlay} onClick={handleClose}>
      <div style={{ ...modalStyle, maxWidth:520, maxHeight:'92vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
        <h2 style={modalTitle}>📷 影像辨識食材</h2>

        {mode === 'choose' && (
          <>
            <p style={{ color:'#64748b', fontSize:13, marginBottom:16 }}>選擇圖片來源，AI 自動辨識食材</p>
            <div style={{ display:'flex', gap:12 }}>
              <button style={srcBtn('#7c3aed', '#faf5ff')} onClick={startCamera}>
                <span style={{ fontSize:28 }}>📸</span>
                <div style={{ fontWeight:700 }}>開啟相機拍照</div>
                <div style={{ fontSize:11, color:'#94a3b8' }}>使用裝置相機</div>
              </button>
              <button style={srcBtn('#0ea5e9', '#f0f9ff')} onClick={() => fileRef.current?.click()}>
                <span style={{ fontSize:28 }}>🖼️</span>
                <div style={{ fontWeight:700 }}>上傳照片</div>
                <div style={{ fontSize:11, color:'#94a3b8' }}>JPG / PNG / WEBP</div>
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => handleFile(e.target.files?.[0] ?? null)} />
            {camError && <div style={{ background:'#fff1f2', color:'#dc2626', borderRadius:10, padding:'12px 16px', marginTop:12, fontSize:14 }}>{camError}</div>}
          </>
        )}

        {mode === 'camera' && (
          <>
            <p style={{ color:'#64748b', fontSize:13, marginBottom:12 }}>對準食材，按下拍照</p>
            <div style={{ position:'relative', borderRadius:16, overflow:'hidden', background:'#000', lineHeight:0 }}>
              <video ref={videoRef} autoPlay playsInline style={{ width:'100%', borderRadius:16, display:'block' }} />
              <canvas ref={canvasRef} style={{ display:'none' }} />
            </div>
            {camError && <div style={{ background:'#fff1f2', color:'#dc2626', borderRadius:10, padding:'12px 16px', marginTop:12, fontSize:14 }}>{camError}</div>}
            <div style={{ display:'flex', gap:8, marginTop:12 }}>
              <button style={cancelBtn} onClick={reset}>取消</button>
              <button style={{ ...saveBtn, background:'linear-gradient(135deg,#7c3aed,#5b21b6)' }} onClick={capture}>📸 拍照</button>
            </div>
          </>
        )}

        {mode === 'preview' && (
          <>
            <div style={{ borderRadius:12, overflow:'hidden', marginBottom:12, background:'#f8fafc', lineHeight:0 }}>
              <img src={imgSrc!} alt="preview" style={{ width:'100%', maxHeight:240, objectFit:'contain', borderRadius:12 }} />
            </div>
            {!results && (
              <div style={{ display:'flex', gap:8 }}>
                <button style={cancelBtn} onClick={reset}>重新選擇</button>
                <button style={{ ...saveBtn, background:'linear-gradient(135deg,#7c3aed,#5b21b6)', opacity: loading ? 0.7 : 1 }} onClick={recognize} disabled={loading}>
                  {loading ? '辨識中…' : '🔍 開始辨識'}
                </button>
              </div>
            )}
            {loading && (
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:16, background:'#f0f9ff', borderRadius:12, marginTop:12 }}>
                <div style={{ width:20, height:20, border:'3px solid #bae6fd', borderTopColor:'#0ea5e9', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
                <span style={{ color:'#0369a1', fontSize:14 }}>AI 正在分析圖片中的食材…</span>
              </div>
            )}
            {error && <div style={{ background:'#fff1f2', color:'#dc2626', borderRadius:10, padding:'12px 16px', marginTop:12, fontSize:14 }}>{error}</div>}
            {results && (
              <div style={{ marginTop:16 }}>
                <p style={{ fontWeight:700, color:'#0c4a6e', fontSize:14, marginBottom:10 }}>
                  ✅ 辨識到 {results.length} 種食材，點擊「使用」填入表單：
                </p>
                {results.map((item, i) => (
                  <div key={i} style={{ background:'#f8fafc', borderRadius:12, padding:'12px 14px', marginBottom:8, border:'1.5px solid #e0f2fe' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:24 }}>{CATEGORY_ICONS[item.category ?? ''] ?? '📦'}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, color:'#0c4a6e' }}>{item.name}</div>
                        <div style={{ fontSize:12, color:'#64748b' }}>{item.category} {item.quantity ? `· ${item.quantity}` : ''}</div>
                        {item.note && <div style={{ fontSize:12, color:'#94a3b8' }}>📝 {item.note}</div>}
                      </div>
                      <button style={{ padding:'6px 16px', background:'linear-gradient(135deg,#0ea5e9,#0369a1)', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}
                        onClick={() => onFill({ name: item.name, category: item.category })}>
                        使用
                      </button>
                    </div>
                  </div>
                ))}
                <button style={{ ...cancelBtn, marginTop:8, width:'100%' }} onClick={reset}>再辨識一張</button>
              </div>
            )}
          </>
        )}

        <button style={{ ...cancelBtn, marginTop:16, width:'100%' }} onClick={handleClose}>關閉</button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
