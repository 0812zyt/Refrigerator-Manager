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
  const [top5, setTop5]         = useState<{ label: string; confidence: number }[] | null>(null);
  const [lowConfidence, setLowConfidence] = useState(false);
  const [closestClass, setClosestClass] = useState('');
  const [error, setError]       = useState('');
  const [camError, setCamError] = useState('');
  const [manualInput, setManualInput] = useState('');

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

  const reset = () => {
    stopCamera();
    setImgSrc(null);
    setImgBase64(null);
    setResults(null);
    setError('');
    setTop5(null);
    setLowConfidence(false);
    setClosestClass('');
    setMode('choose');
  };
  const handleClose = () => { stopCamera(); onClose(); };

  const recognize = async () => {
    if (!imgBase64) return;
    setLoading(true); setError(''); setResults(null); setTop5(null); setLowConfidence(false); setClosestClass('');
    try {
      // 支援本地開發與線上 API 自動切換：如果包含 localhost 則呼叫本地，否則呼叫相對/線上路徑
      const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? '/api/v1/system/recognize'
        : 'https://smartfridge-f6b6.onrender.com/api/v1/system/recognize';

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: imgBase64 }),
      });
      const data = await res.json();
      
      setTop5(data.top5 || []);
      setLowConfidence(data.low_confidence);
      setClosestClass(data.closest_class);

      if (data.validated && data.label) {
        setResults([{ name: data.label, quantity: '', note: '' }]);
      } else if (data.low_confidence) {
        // 信心不足，但有候選清單，不直接報錯，而是讓用戶從下方選單選取
        setResults([]); 
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
            {!results && !top5 && (
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
            {(results || (top5 && top5.length > 0)) && (
              <div style={{ marginTop:16 }}>
                {/* 1. 高信心度結果 */}
                {results && results.length > 0 && (
                  <>
                    <p style={{ fontWeight:700, color:'#059669', fontSize:14, marginBottom:10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>✅ AI 辨識成功！</span>
                    </p>
                    {results.map((item, i) => (
                      <div key={i} style={{ background:'#ecfdf5', borderRadius:12, padding:'14px', marginBottom:12, border:'1.5px solid #a7f3d0', boxShadow: '0 2px 8px rgba(16,185,129,0.05)' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <span style={{ fontSize:28 }}>{CATEGORY_ICONS[item.category ?? ''] ?? '🍎'}</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:700, color:'#065f46', fontSize: 16 }}>{item.name}</div>
                            <div style={{ fontSize:12, color:'#047857', opacity: 0.8 }}>已成功辨識</div>
                          </div>
                          <button style={{ padding:'8px 18px', background:'linear-gradient(135deg,#10b981,#059669)', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow: '0 2px 6px rgba(16,185,129,0.2)' }}
                            onClick={() => onFill({ name: item.name, category: item.category })}>
                            直接使用
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* 2. 低信心度警告提示 */}
                {lowConfidence && (
                  <div style={{ background:'#fff7ed', border:'1.5px solid #fed7aa', borderRadius:12, padding:'12px 14px', marginBottom:12, display:'flex', flexDirection:'column', gap: 4 }}>
                    <div style={{ fontWeight:700, color:'#c2410c', fontSize:14, display:'flex', alignItems:'center', gap:6 }}>
                      <span>⚠️ 影像信心度不足，請手動確認</span>
                    </div>
                    <div style={{ fontSize:12, color:'#9a3412' }}>
                      最接近的類別可能為 <strong>{closestClass}</strong>，您也可以從下方候選清單中選擇：
                    </div>
                  </div>
                )}

                {/* 3. Top 5 候選清單 */}
                {top5 && top5.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <p style={{ fontWeight:700, color:'#475569', fontSize:13, marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
                      <span>📊 AI 預測候選清單 (Top 5)</span>
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {top5.map((cand, idx) => {
                        return (
                          <div key={idx} style={{ 
                            background:'#f8fafc', 
                            borderRadius:12, 
                            padding:'10px 14px', 
                            border:'1px solid #e2e8f0',
                            display:'flex',
                            alignItems:'center',
                            justifyContent:'space-between',
                          }}>
                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                              <span style={{ fontSize:20 }}>💡</span>
                              <span style={{ fontWeight: 600, color: '#334155' }}>{cand.label}</span>
                            </div>
                            <button style={{ 
                              padding:'5px 12px', 
                              background:'linear-gradient(135deg,#3b82f6,#1d4ed8)', 
                              color:'#fff', 
                              border:'none', 
                              borderRadius:8, 
                              fontSize:12, 
                              fontWeight:600, 
                              cursor:'pointer',
                              boxShadow: '0 2px 4px rgba(59,130,246,0.1)'
                            }}
                              onClick={() => onFill({ name: cand.label })}>
                              選用
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 手動輸入 */}
                <div style={{ marginTop:16, padding:'14px', background:'#f8fafc', borderRadius:12, border:'1px solid #e2e8f0' }}>
                  <p style={{ fontSize:13, color:'#64748b', fontWeight:600, marginBottom:8 }}>手動輸入食材名稱</p>
                  <div style={{ display:'flex', gap:8 }}>
                    <input
                      value={manualInput}
                      onChange={e => setManualInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && manualInput.trim()) { onFill({ name: manualInput.trim() }); handleClose(); } }}
                      placeholder="輸入食材名稱…"
                      style={{ flex:1, padding:'10px 12px', borderRadius:8, border:'1.5px solid #e2e8f0', fontSize:14, outline:'none' }}
                    />
                    <button
                      onClick={() => { if (manualInput.trim()) { onFill({ name: manualInput.trim() }); handleClose(); } }}
                      style={{ padding:'10px 16px', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:700, cursor:'pointer' }}>
                      使用
                    </button>
                  </div>
                </div>

                <button style={{ ...cancelBtn, marginTop:12, width:'100%' }} onClick={reset}>再辨識一張</button>
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
