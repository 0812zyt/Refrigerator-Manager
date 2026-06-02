import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } from '@zxing/library';
import { overlay, modalStyle, modalTitle, cancelBtn, saveBtn } from '../pages/DashboardPage';

interface Props {
  onClose: () => void;
  onFill: (data: { name: string; category?: string }) => void;
  deviceMode?: boolean;
}

async function lookupBarcode(ean: string): Promise<string | null> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${ean}.json`);
    const data = await res.json();
    if (data.status !== 1) return null;
    const p = data.product;
    return p.product_name_zh || p.product_name_tw || p.product_name || null;
  } catch {
    return null;
  }
}

export default function BarcodeScanModal({ onClose, onFill, deviceMode }: Props) {
  const [status, setStatus]     = useState<'scanning' | 'found' | 'notfound' | 'error'>('scanning');
  const [barcode, setBarcode]   = useState('');
  const [productName, setProductName] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [camError, setCamError] = useState('');

  const videoRef  = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  const isLine = /Line/i.test(navigator.userAgent);
  const captureRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isLine) return;
    let cancelled = false;
    let ownStream: MediaStream | null = null;

    const applyFocus = async (track: MediaStreamTrack) => {
      try {
        const caps = (track.getCapabilities?.() ?? {}) as Record<string, unknown>;
        const advanced: Record<string, unknown>[] = [];
        const focusModes = (caps.focusMode as string[] | undefined) ?? [];
        if ('pointsOfInterest' in caps) advanced.push({ pointsOfInterest: [{ x: 0.5, y: 0.5 }] });
        if (focusModes.includes('continuous')) advanced.push({ focusMode: 'continuous' });
        if ('zoom' in caps) {
          const z = caps.zoom as { min: number; max: number };
          const target = Math.min(z.max, Math.max(z.min, (z.min + z.max) / 2));
          advanced.push({ zoom: target });
        }
        if (advanced.length > 0) {
          await track.applyConstraints({ advanced } as unknown as MediaTrackConstraints);
        }
      } catch (e) {
        console.warn('[barcode] applyConstraints failed', e);
      }
    };

    const handleFound = async (code: string) => {
      if (cancelled) return;
      cancelled = true;
      ownStream?.getTracks().forEach(t => t.stop());
      readerRef.current?.reset();
      setBarcode(code);
      setStatus('found');
      const name = await lookupBarcode(code);
      if (name) { setProductName(name); setManualInput(name); }
      else setStatus('notfound');
    };

    const start = async () => {
      // 路徑 A：原生 BarcodeDetector（手機硬體加速，速度跟原生 App 一樣）
      const NativeBD = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => { detect: (src: ImageBitmapSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      if (NativeBD) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          });
          ownStream = stream;
          if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
          const v = videoRef.current!;
          v.srcObject = stream;
          await v.play();
          await applyFocus(stream.getVideoTracks()[0]);
          const detector = new NativeBD({ formats: ['ean_13', 'ean_8', 'upc_a'] });
          console.log('[barcode] using native BarcodeDetector');
          const loop = async () => {
            if (cancelled) return;
            try {
              const codes = await detector.detect(v);
              if (codes.length > 0) { handleFound(codes[0].rawValue); return; }
            } catch (e) { console.warn('[barcode] detect error', e); }
            // 每 ~150ms 掃一次，已經夠快又不卡
            setTimeout(() => requestAnimationFrame(loop), 150);
          };
          loop();
          return;
        } catch (e) {
          console.warn('[barcode] native detector failed, fall back to ZXing', e);
        }
      }

      // 路徑 B：ZXing 退路（Firefox / 舊 iOS）
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A]);
      const reader = new BrowserMultiFormatReader(hints, 250);
      readerRef.current = reader;
      const onMeta = () => {
        const stream = videoRef.current?.srcObject as MediaStream | null;
        const track = stream?.getVideoTracks()[0];
        if (track) applyFocus(track);
      };
      videoRef.current?.addEventListener('loadedmetadata', onMeta);
      console.log('[barcode] using ZXing fallback');
      reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        videoRef.current!,
        async (result) => { if (result) handleFound(result.getText()); }
      ).catch(() => setCamError('無法存取相機，請確認已授予相機權限。'));
    };

    start();

    return () => {
      cancelled = true;
      ownStream?.getTracks().forEach(t => t.stop());
      readerRef.current?.reset();
    };
  }, [isLine]);

  const handleConfirm = () => {
    const name = manualInput.trim();
    if (!name) return;
    onFill({ name });
  };


  const wrapStyle: React.CSSProperties = deviceMode
    ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, background: '#000', display: 'flex', flexDirection: 'column' }
    : undefined as unknown as React.CSSProperties;

  if (deviceMode) {
    return (
      <div style={wrapStyle}>
        <input ref={captureRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} />

        {/* Video */}
        {!isLine && status === 'scanning' && (
          <>
            <video ref={videoRef} autoPlay playsInline style={{ width: '100%', flex: 1, objectFit: 'cover' }} />
            {/* Scan frame overlay */}
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-60%)', width: 240, height: 120, border: '2px solid rgba(255,255,255,0.7)', borderRadius: 8, boxShadow: '0 0 0 1000px rgba(0,0,0,0.45)' }}>
              <div style={{ position: 'absolute', top: -1, left: -1, width: 24, height: 24, borderTop: '3px solid #6366f1', borderLeft: '3px solid #6366f1', borderRadius: '4px 0 0 0' }} />
              <div style={{ position: 'absolute', top: -1, right: -1, width: 24, height: 24, borderTop: '3px solid #6366f1', borderRight: '3px solid #6366f1', borderRadius: '0 4px 0 0' }} />
              <div style={{ position: 'absolute', bottom: -1, left: -1, width: 24, height: 24, borderBottom: '3px solid #6366f1', borderLeft: '3px solid #6366f1', borderRadius: '0 0 0 4px' }} />
              <div style={{ position: 'absolute', bottom: -1, right: -1, width: 24, height: 24, borderBottom: '3px solid #6366f1', borderRight: '3px solid #6366f1', borderRadius: '0 0 4px 0' }} />
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: 'rgba(99,102,241,0.7)', transform: 'translateY(-50%)' }} />
            </div>
            <div style={{ position: 'absolute', bottom: 80, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>對準條碼掃描</div>
            <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.3)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </>
        )}

        {isLine && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
            <button onClick={() => captureRef.current?.click()} style={{ padding: '16px 36px', borderRadius: 14, background: '#fff', color: '#1a1a1a', border: 'none', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>📷 拍攝條碼</button>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center' }}>若無法使用，請點右上角 <strong style={{ color: '#fff' }}>···</strong> → 在瀏覽器中開啟</div>
          </div>
        )}

        {/* Result overlay */}
        {(status === 'found' || status === 'notfound') && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(15,23,42,0.96)', padding: '20px 20px 32px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ color: '#94a3b8', fontSize: 12 }}>條碼：{barcode}</div>
            {status === 'notfound' && <div style={{ color: '#fbbf24', fontSize: 13 }}>⚠️ 查無產品，請手動輸入名稱</div>}
            <input value={manualInput} onChange={e => setManualInput(e.target.value)} placeholder="食材名稱…" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, outline: 'none' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#94a3b8', border: 'none', fontSize: 13, cursor: 'pointer' }}>取消</button>
              <button onClick={handleConfirm} disabled={!manualInput.trim()} style={{ flex: 2, padding: '10px', borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>使用此名稱</button>
            </div>
          </div>
        )}

        {camError && <div style={{ position: 'absolute', bottom: 20, left: 16, right: 16, background: 'rgba(220,38,38,0.9)', color: '#fff', borderRadius: 10, padding: '12px 16px', fontSize: 13, textAlign: 'center' }}>{camError}</div>}
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Normal modal mode
  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...modalStyle, maxWidth: 480, maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <h2 style={modalTitle}>條碼掃描</h2>

        {status === 'scanning' && (
          <>
            {isLine ? (
              <>
                <input ref={captureRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} />
                <button onClick={() => captureRef.current?.click()} style={{ width: '100%', padding: '14px', borderRadius: 12, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 12 }}>📷 拍攝條碼</button>
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#92400e' }}>若無法使用，請點右上角 <strong>···</strong> → 在瀏覽器中開啟</div>
              </>
            ) : (
              <>
                <p style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>將條碼對準框內，自動掃描</p>
                <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#000', lineHeight: 0, marginBottom: 12 }}>
                  <video ref={videoRef} autoPlay playsInline style={{ width: '100%', borderRadius: 14 }} />
                  {/* Scan frame */}
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '70%', height: 80, border: '2px solid rgba(255,255,255,0.6)', borderRadius: 6 }}>
                    <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: 'rgba(99,102,241,0.8)', transform: 'translateY(-50%)' }} />
                  </div>
                </div>
                {camError && <div style={{ background: '#fff1f2', color: '#dc2626', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 8 }}>{camError}</div>}
              </>
            )}
          </>
        )}

        {(status === 'found' || status === 'notfound') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#64748b' }}>條碼：{barcode}</div>
            {status === 'notfound' && <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e' }}>⚠️ Open Food Facts 查無此產品，請手動輸入名稱</div>}
            {productName && <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '10px 14px', fontSize: 14, color: '#065f46', fontWeight: 600 }}>✅ {productName}</div>}
            <input value={manualInput} onChange={e => setManualInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && manualInput.trim()) handleConfirm(); }} placeholder="食材名稱…" style={{ padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={cancelBtn}>取消</button>
              <button onClick={handleConfirm} disabled={!manualInput.trim()} style={{ ...saveBtn, opacity: manualInput.trim() ? 1 : 0.5 }}>使用此名稱</button>
            </div>
          </div>
        )}

        <button style={{ ...cancelBtn, marginTop: 16, width: '100%' }} onClick={onClose}>關閉</button>
      </div>
    </div>
  );
}
