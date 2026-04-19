import { useEffect, useState } from 'react';
import { getUsers, wakeSystem, createUser } from '../api/client';
import type { User } from '../api/types';

interface Props { onLogin: (user: User) => void; }

export default function LoginPage({ onLogin }: Props) {
  const [form, setForm]       = useState({ username: '', password: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [users, setUsers]     = useState<User[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    wakeSystem().catch(() => {});
    getUsers().then(setUsers).catch(() => {});
  }, []);

  const handleLogin = async () => {
    if (!form.username.trim()) { setError('請輸入帳號'); return; }
    setLoading(true); setError('');
    try {
      const list = users.length ? users : await getUsers();
      const found = list.find(u => u.username.toLowerCase() === form.username.trim().toLowerCase());
      if (found) onLogin(found);
      else setError('帳號不存在，請建立帳號');
    } catch { setError('連線失敗，請稍後再試'); }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const u = await createUser({ username: newName.trim() });
      onLogin(u);
    } catch { setError('建立帳號失敗'); setCreating(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a,#1e1b4b,#0f172a)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "'Noto Sans TC',sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, margin: '0 auto 16px', boxShadow: '0 8px 32px rgba(99,102,241,0.4)' }}>🧊</div>
          <h1 style={{ color: '#f1f5f9', fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>冰箱管家</h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>管理食材，告別浪費</p>
        </div>

        {/* Card */}
        <div style={{ background: 'rgba(30,41,59,0.8)', backdropFilter: 'blur(20px)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 20, padding: 32, boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>

          {!showCreate ? (
            <>
              <Field label="帳號">
                <Input placeholder="輸入帳號" value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()} />
              </Field>
              <Field label="密碼">
                <Input type="password" placeholder="輸入密碼" value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()} />
              </Field>
              {error && <p style={{ color: '#f87171', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{error}</p>}
              <PrimaryBtn onClick={handleLogin} disabled={loading}>{loading ? '登入中…' : '登入'}</PrimaryBtn>
              {users.length > 0 && <p style={{ color: '#475569', fontSize: 12, textAlign: 'center', marginTop: 12 }}>現有帳號：{users.map(u => u.username).join('、')}</p>}
              <GhostBtn onClick={() => { setShowCreate(true); setError(''); }}>+ 建立新帳號</GhostBtn>
            </>
          ) : (
            <>
              <Field label="使用者名稱">
                <Input placeholder="輸入名稱" value={newName} autoFocus
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()} />
              </Field>
              {error && <p style={{ color: '#f87171', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{error}</p>}
              <PrimaryBtn onClick={handleCreate} disabled={creating}>{creating ? '建立中…' : '建立並登入'}</PrimaryBtn>
              <GhostBtn onClick={() => { setShowCreate(false); setError(''); }}>← 返回登入</GhostBtn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 16 }}>
    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>{label}</label>
    {children}
  </div>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1.5px solid rgba(99,102,241,0.2)', background: 'rgba(15,23,42,0.5)', color: '#f1f5f9', fontSize: 14, outline: 'none', boxSizing: 'border-box', caretColor: '#818cf8', ...props.style }} />;
}

function PrimaryBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} style={{ width: '100%', padding: 13, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4, ...props.style }}>{children}</button>;
}

function GhostBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} style={{ width: '100%', padding: 11, background: 'transparent', color: '#64748b', border: '1.5px dashed rgba(99,102,241,0.2)', borderRadius: 12, fontSize: 13, cursor: 'pointer', marginTop: 10, ...props.style }}>{children}</button>;
}
