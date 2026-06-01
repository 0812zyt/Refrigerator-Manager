import { useCallback, useEffect, useRef, useState } from 'react';
import { overlay, modalStyle, modalTitle, cancelBtn, saveBtn } from '../pages/DashboardPage';
import { compressImage } from '../utils/imageCompress';

interface RecognizeResult {
  name: string;
  category?: string;
  quantity?: string;
  note?: string;
}

interface Props {
  onClose: () => void;
  onFill: (data: { name: string; category?: string; photo?: string }) => void;
  deviceMode?: boolean;
  onDirectAdd?: (name: string, category?: string, photo?: string) => Promise<void>;
}

const CATEGORY_ICONS: Record<string, string> = {
  蔬菜:'🥬', 水果:'🍎', 肉類:'🥩', 乳製品:'🧀', 飲料:'🥤',
  調味料:'🧂', 冷凍食品:'🧊', 其他:'📦',
};

export default function ImageRecognizeModal({ onClose, onFill, deviceMode, onDirectAdd }: Props) {
  const [mode, setMode]         = useState<'choose' | 'camera' | 'preview'>(deviceMode ? 'camera' : 'choose');
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
  const [addState, setAddState] = useState<'idle' | 'adding' | 'done'>('idle');
  const [addedName, setAddedName] = useState('');

  const isLine = /Line/i.test(navigator.userAgent);

  const fileRef    = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    setCamError(''); setMode('camera');
    // 主方案（LINE）：觸發 file input capture，不走 getUserMedia
    if (isLine) return;
    try {
      let stream: MediaStream;
      const hiRes = { width: { ideal: 1280 }, height: { ideal: 720 } };
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', ...hiRes } });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { ...hiRes } });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
      }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        const s = track.getSettings();
        console.log('[camera] track settings:', s.width, 'x', s.height, 'label:', track.label);
      }
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setCamError('無法存取相機，請確認已授予相機權限，或改用上傳方式。');
    }
  }, [isLine]);

  // Assign stream to video element once it mounts (handles the setMode→render race)
  useEffect(() => {
    if (mode === 'camera' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [mode]);

  useEffect(() => {
    if (deviceMode) {
      if (isLine) {
        // LINE 模式：直接觸發 capture input，不需要 getUserMedia
        captureRef.current?.click();
      } else {
        startCamera();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const capture = async () => {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const vw = video.videoWidth, vh = video.videoHeight;
    console.log('[capture] video size:', vw, 'x', vh);
    if (!vw || !vh) {
      setCamError('相機尚未準備好，請稍候再按。');
      return;
    }
    canvas.width = vw; canvas.height = vh;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const raw = canvas.toDataURL('image/jpeg', 0.92);
    const compressed = await compressImage(raw, 800, 0.7);
    console.log('[capture] raw size:', raw.length, '→ compressed:', compressed.length);
    setImgSrc(compressed); setImgBase64(compressed.split(',')[1]);
    stopCamera(); setMode('preview');
  };

  const handleFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
      const raw = e.target!.result as string;
      const compressed = await compressImage(raw, 800, 0.7);
      console.log('[upload] raw size:', raw.length, '→ compressed:', compressed.length);
      setImgSrc(compressed); setImgBase64(compressed.split(',')[1]);
      setResults(null); setError(''); setMode('preview');
    };
    reader.readAsDataURL(file);
  };

  const reset = () => {
    setImgSrc(null);
    setImgBase64(null);
    setResults(null);
    setError('');
    setTop5(null);
    setLowConfidence(false);
    setClosestClass('');
    if (deviceMode) {
      startCamera();
    } else {
      stopCamera();
      setMode('choose');
    }
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

      if (!res.ok) {
        setError(data.detail ?? '辨識服務暫時無法使用，請稍後再試。');
      } else {
        setTop5(data.top5 || []);
        setLowConfidence(data.low_confidence);
        setClosestClass(data.closest_class);

        if (data.validated && data.label) {
          setResults([{ name: data.label, quantity: '', note: '' }]);
        } else if (data.low_confidence) {
          setResults([]);
        } else {
          setError('辨識信心度不足，請手動輸入或重新拍照。');
        }
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

  if (deviceMode) {
    return (
      <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, zIndex:1000, background:'#000' }}>
        {/* LINE capture input（隱藏，主方案） */}
        <input ref={captureRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
          onChange={e => { handleFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />

        {mode === 'camera' && (
          <>
            {isLine ? (
              /* LINE 主方案：大按鈕觸發系統相機 */
              <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20 }}>
                <button onClick={() => captureRef.current?.click()}
                  style={{ padding:'18px 40px', borderRadius:16, background:'#fff', color:'#1a1a1a', border:'none', fontSize:17, fontWeight:800, cursor:'pointer', boxShadow:'0 4px 20px rgba(255,255,255,0.2)' }}>
                  📷 開啟相機拍照
                </button>
                {/* 備援 A：引導外部瀏覽器 */}
                <div style={{ color:'rgba(255,255,255,0.5)', fontSize:12, textAlign:'center', padding:'0 32px', lineHeight:1.6 }}>
                  若無法拍照，請點右上角 <strong style={{ color:'#fff' }}>···</strong> →「在瀏覽器中開啟」
                </div>
                <button onClick={onClose} style={{ position:'absolute', top:12, right:12, width:36, height:36, borderRadius:'50%', background:'rgba(255,255,255,0.15)', color:'#fff', border:'none', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
              </div>
            ) : (
              /* 一般瀏覽器：video stream */
              <>
                <video ref={videoRef} autoPlay playsInline style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                <canvas ref={canvasRef} style={{ display:'none' }} />
                {camError && (
                  <div style={{ position:'absolute', bottom:80, left:16, right:16, background:'rgba(220,38,38,0.9)', color:'#fff', borderRadius:10, padding:'12px 16px', fontSize:14, textAlign:'center' }}>{camError}</div>
                )}
                <button onClick={capture} style={{ position:'absolute', bottom:28, left:'50%', transform:'translateX(-50%)', width:72, height:72, borderRadius:'50%', background:'#fff', border:'4px solid rgba(255,255,255,0.5)', cursor:'pointer', boxShadow:'0 4px 16px rgba(0,0,0,0.4)' }} />
                <button onClick={onClose} style={{ position:'absolute', top:12, right:12, width:36, height:36, borderRadius:'50%', background:'rgba(0,0,0,0.5)', color:'#fff', border:'none', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
              </>
            )}
          </>
        )}

        {mode === 'preview' && (
          <>
            <img src={imgSrc!} alt="preview" style={{ width:'100%', height:'100%', objectFit:'contain', display:'block' }} />
            {/* Top bar */}
            <button onClick={reset} style={{ position:'absolute', top:12, left:12, padding:'8px 18px', borderRadius:20, background:'rgba(0,0,0,0.55)', color:'#fff', border:'none', fontSize:14, fontWeight:700, cursor:'pointer', zIndex:2 }}>重新拍</button>
            {/* Recognize button */}
            {!results && !top5 && !loading && (
              <button onClick={recognize} style={{ position:'absolute', bottom:28, left:'50%', transform:'translateX(-50%)', padding:'14px 36px', borderRadius:30, background:'linear-gradient(135deg,#7c3aed,#5b21b6)', color:'#fff', border:'none', fontSize:16, fontWeight:800, cursor:'pointer', boxShadow:'0 4px 16px rgba(0,0,0,0.4)', whiteSpace:'nowrap' }}>
                🔍 開始辨識
              </button>
            )}
            {loading && (
              <div style={{ position:'absolute', bottom:28, left:'50%', transform:'translateX(-50%)', display:'flex', alignItems:'center', gap:10, padding:'12px 24px', background:'rgba(0,0,0,0.7)', borderRadius:24, color:'#fff', fontSize:14, whiteSpace:'nowrap' }}>
                <div style={{ width:18, height:18, border:'3px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
                AI 辨識中…
              </div>
            )}
            {error && (
              <div style={{ position:'absolute', bottom:80, left:16, right:16, background:'rgba(220,38,38,0.9)', color:'#fff', borderRadius:10, padding:'12px 16px', fontSize:14, textAlign:'center' }}>{error}</div>
            )}
            {/* Results overlay */}
            {(results || (top5 && top5.length > 0)) && (
              <div style={{ position:'absolute', top:0, left:0, right:0, bottom:0, background:'rgba(15,23,42,0.55)', display:'flex', flexDirection:'column', zIndex:1 }}>
                {addState === 'done' ? (
                  <>
                    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 }}>
                      <span style={{ fontSize:48 }}>✅</span>
                      <div style={{ color:'#a7f3d0', fontWeight:700, fontSize:18 }}>成功新增</div>
                      <div style={{ color:'#94a3b8', fontSize:14 }}>{addedName}</div>
                    </div>
                    <button onClick={onClose} style={{ flexShrink:0, width:'100%', padding:'14px', background:'rgba(255,255,255,0.08)', color:'#e2e8f0', border:'none', borderTop:'1px solid rgba(255,255,255,0.1)', fontSize:15, fontWeight:700, cursor:'pointer' }}>返回</button>
                  </>
                ) : (
                  <>
                    <div style={{ color:'#e2e8f0', fontSize:14, fontWeight:700, padding:'18px 14px 8px', flexShrink:0, textAlign:'center' }}>辨識結果</div>
                    <div style={{ flex:1, overflowY:'auto', padding:'8px 14px' }}>

                      {/* 1. 高信心度結果 */}
                      {results && results.length > 0 && results.map((item, i) => (
                        <button key={i} disabled={addState === 'adding'} onClick={async () => { if (!onDirectAdd) { onFill({ name: item.name, category: item.category, photo: imgSrc ?? undefined }); return; } setAddState('adding'); setAddedName(item.name); await onDirectAdd(item.name, item.category, imgSrc ?? undefined); setAddState('done'); }}
                          style={{ display:'block', width:'100%', padding:'12px 16px', background: addState === 'adding' ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.15)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:10, color:'#a7f3d0', fontWeight:700, fontSize:15, textAlign:'left', cursor: addState === 'adding' ? 'wait' : 'pointer', marginBottom:10 }}>
                          {addState === 'adding' && addedName === item.name ? '新增中…' : `✅ ${item.name}`}
                        </button>
                      ))}

                      {/* 2. 低信心度 → 用 closestClass 顯示為主要結果（修正：deviceMode 補上此區塊） */}
                      {lowConfidence && closestClass && (
                        <button
                          disabled={addState === 'adding'}
                          onClick={async () => {
                            if (!onDirectAdd) { onFill({ name: closestClass, photo: imgSrc ?? undefined }); return; }
                            setAddState('adding'); setAddedName(closestClass);
                            await onDirectAdd(closestClass, undefined, imgSrc ?? undefined);
                            setAddState('done');
                          }}
                          style={{ display:'block', width:'100%', padding:'12px 16px', background: addState === 'adding' ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.15)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:10, color:'#a7f3d0', fontWeight:700, fontSize:15, textAlign:'left', cursor: addState === 'adding' ? 'wait' : 'pointer', marginBottom:10 }}>
                          {addState === 'adding' && addedName === closestClass ? '新增中…' : `✅ ${closestClass}`}
                        </button>
                      )}

                      {/* 3. Top 5 候選清單（修正：過濾掉已顯示的主要結果） */}
                      {top5 && top5.length > 0 && (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                          {top5
                            .filter(cand =>
                              !results?.some(r => r.name.toLowerCase() === cand.label.toLowerCase()) &&
                              cand.label.toLowerCase() !== closestClass.toLowerCase()
                            )
                            .map((cand, idx) => (
                              <button key={idx} disabled={addState === 'adding'} onClick={async () => { if (!onDirectAdd) { onFill({ name: cand.label, photo: imgSrc ?? undefined }); return; } setAddState('adding'); setAddedName(cand.label); await onDirectAdd(cand.label, undefined, imgSrc ?? undefined); setAddState('done'); }}
                                style={{ padding:'8px 14px', background: addState === 'adding' && addedName === cand.label ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:10, color:'#e2e8f0', fontSize:13, cursor: addState === 'adding' ? 'wait' : 'pointer', whiteSpace:'nowrap' }}>
                                {addState === 'adding' && addedName === cand.label ? '新增中…' : cand.label}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                    <button onClick={onClose} style={{ flexShrink:0, width:'100%', padding:'12px', background:'rgba(255,255,255,0.08)', color:'#94a3b8', border:'none', borderTop:'1px solid rgba(255,255,255,0.1)', fontSize:13, cursor:'pointer' }}>取消</button>
                  </>
                )}
              </div>
            )}
          </>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={overlay} onClick={handleClose}>
      <div style={{ ...modalStyle, maxWidth:520, maxHeight:'92vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
        <h2 style={modalTitle}>影像辨識食材</h2>

        {mode === 'choose' && (
          <>
            <div style={{ display:'flex', gap:12 }}>
              {/* 主方案：LINE 用 capture input，一般用 getUserMedia */}
              <button style={srcBtn('#7c3aed', '#faf5ff')} onClick={() => isLine ? captureRef.current?.click() : startCamera()}>
                <i className="fi fi-rr-camera" style={{ fontSize:28, color:'#7c3aed', display:'flex', alignItems:'center' }} />
                <div style={{ fontWeight:700 }}>開啟相機拍照</div>
              </button>
              <button style={srcBtn('#0ea5e9', '#f0f9ff')} onClick={() => fileRef.current?.click()}>
                <i className="fi fi-rr-picture" style={{ fontSize:28, color:'#0ea5e9', display:'flex', alignItems:'center' }} />
                <div style={{ fontWeight:700 }}>上傳照片</div>
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => handleFile(e.target.files?.[0] ?? null)} />
            <input ref={captureRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={e => { handleFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
            {/* 備援 A：LINE 引導提示 */}
            {isLine && <div style={{ background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:10, padding:'10px 14px', marginTop:12, fontSize:12, color:'#92400e', lineHeight:1.6 }}>
              若無法拍照，請點右上角 <strong>···</strong> →「在瀏覽器中開啟」
            </div>}
            {camError && <div style={{ background:'#fff1f2', color:'#dc2626', borderRadius:10, padding:'12px 16px', marginTop:12, fontSize:14 }}>{camError}</div>}
          </>
        )}

        {mode === 'camera' && !isLine && (
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
                      <span>辨識結果</span>
                    </p>
                    {results.map((item, i) => (
                      <div key={i} style={{ background:'#ecfdf5', borderRadius:12, padding:'14px', marginBottom:12, border:'1.5px solid #a7f3d0', boxShadow: '0 2px 8px rgba(16,185,129,0.05)' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <span style={{ fontSize:28 }}>{CATEGORY_ICONS[item.category ?? ''] ?? '🍎'}</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:700, color:'#065f46', fontSize: 16 }}>{item.name}</div>
                          </div>
                          <button style={{ padding:'8px 18px', background:'linear-gradient(135deg,#10b981,#059669)', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow: '0 2px 6px rgba(16,185,129,0.2)' }}
                            onClick={() => onFill({ name: item.name, category: item.category, photo: imgSrc ?? undefined })}>
                            直接使用
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* 2. 低信心度 → 用 closestClass 顯示為主要結果 */}
                {lowConfidence && closestClass && (
                  <>
                    <p style={{ fontWeight:700, color:'#059669', fontSize:14, marginBottom:10 }}>辨識結果</p>
                    <div style={{ background:'#ecfdf5', borderRadius:12, padding:'14px', marginBottom:12, border:'1.5px solid #a7f3d0', boxShadow:'0 2px 8px rgba(16,185,129,0.05)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <span style={{ fontSize:28 }}>{CATEGORY_ICONS[closestClass] ?? '🍎'}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, color:'#065f46', fontSize:16 }}>{closestClass}</div>
                        </div>
                        <button style={{ padding:'8px 18px', background:'linear-gradient(135deg,#10b981,#059669)', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 2px 6px rgba(16,185,129,0.2)' }}
                          onClick={() => onFill({ name: closestClass, photo: imgSrc ?? undefined })}>
                          直接使用
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* 3. Top 5 候選清單（排除已辨識結果） */}
                {top5 && top5.length > 0 && (
                  <div style={{ marginTop: 14, display:'flex', flexWrap:'wrap', gap:8 }}>
                    {top5.filter(cand =>
                      !results?.some(r => r.name.toLowerCase() === cand.label.toLowerCase()) &&
                      cand.label.toLowerCase() !== closestClass.toLowerCase()
                    ).map((cand, idx) => (
                      <button key={idx} onClick={() => onFill({ name: cand.label, photo: imgSrc ?? undefined })} style={{
                        display:'inline-flex', alignItems:'center', gap:6,
                        padding:'8px 14px',
                        background:'#f8fafc', borderRadius:10, border:'1px solid #e2e8f0',
                        cursor:'pointer', whiteSpace:'nowrap',
                      }}>
                        <span style={{ fontSize:16 }}>💡</span>
                        <span style={{ fontWeight:600, color:'#334155', fontSize:14 }}>{cand.label}</span>
                      </button>
                    ))}
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
