import { useEffect, useState } from 'react';
import { getSystemStatus, wakeSystem, sleepSystem, scanExpiry } from '../api/client';

export default function SystemStatusBar() {
  const [status, setStatus] = useState<'active' | 'sleep' | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanMsg, setScanMsg] = useState('');

  const fetchStatus = () =>
    getSystemStatus().then(s => setStatus(s.status)).catch(() => {});

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 10000);
    return () => clearInterval(id);
  }, []);

  const toggle = async () => {
    setLoading(true);
    try {
      if (status === 'active') {
        await sleepSystem();
        setStatus('sleep');
      } else {
        await wakeSystem();
        setStatus('active');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async () => {
    setScanMsg('');
    try {
      await scanExpiry();
      setScanMsg('到期掃描完成');
    } catch {
      setScanMsg('掃描失敗');
    }
    setTimeout(() => setScanMsg(''), 3000);
  };

  const isActive = status === 'active';

  return (
    <div className={`flex items-center gap-3 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${isActive ? 'bg-green-50 border border-green-200' : 'bg-gray-100 border border-gray-200'}`}>
      <span className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
      <span className={isActive ? 'text-green-700' : 'text-gray-500'}>
        {status == null ? '載入中…' : isActive ? '系統運行中' : '系統休眠中'}
      </span>
      <button
        onClick={toggle}
        disabled={loading || status == null}
        className={`ml-1 px-3 py-1 rounded-lg text-xs transition-all disabled:opacity-50 ${isActive ? 'bg-gray-200 hover:bg-gray-300 text-gray-700' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}
      >
        {loading ? '…' : isActive ? '休眠' : '喚醒'}
      </button>
      {isActive && (
        <button
          onClick={handleScan}
          className="px-3 py-1 rounded-lg text-xs bg-orange-100 hover:bg-orange-200 text-orange-700 transition-all"
        >
          掃描到期
        </button>
      )}
      {scanMsg && <span className="text-xs text-green-600">{scanMsg}</span>}
    </div>
  );
}
