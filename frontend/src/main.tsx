import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ── 自動救援：啟動 5 秒內崩潰 → 清掉 localStorage 自動重整一次 ────────────
const BOOT_FLAG = '__boot_attempt';
const bootAttempt = parseInt(sessionStorage.getItem(BOOT_FLAG) ?? '0', 10);
sessionStorage.setItem(BOOT_FLAG, String(bootAttempt + 1));

const recover = (reason: string) => {
  if (bootAttempt >= 1) {
    console.error('[boot] 救援後仍失敗', reason);
    return;
  }
  console.warn('[boot] 偵測到啟動失敗，清除快取重整', reason);
  try {
    // 保留 sessionStorage 的 BOOT_FLAG，其他全部清掉
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
    // Supabase 自己的 token 也在 localStorage 裡，清掉等於登出
  } catch {}
  location.reload();
};

window.addEventListener('error', e => recover(`error: ${e.message}`));
window.addEventListener('unhandledrejection', e => recover(`promise: ${e.reason}`));

setTimeout(() => {
  const root = document.getElementById('root');
  if (!root || root.children.length === 0) {
    recover('5s timeout: root empty');
  } else {
    // 成功掛載：清掉本次 boot flag，下次重新計算
    sessionStorage.removeItem(BOOT_FLAG);
  }
}, 5000);

try {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} catch (e) {
  recover(`render throw: ${e instanceof Error ? e.message : String(e)}`);
}
