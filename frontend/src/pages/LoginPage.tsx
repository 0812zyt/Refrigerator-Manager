import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { createUser } from '../api/client';
import type { User } from '../api/types';

interface Props { onLogin: (user: User) => void; }

const toEmail = (username: string) => `${username.trim().toLowerCase().replace(/\s+/g, '_')}@fridgeapp.local`;

export default function LoginPage({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
    if (!username.trim()) { setError('請輸入使用者名稱'); return; }
    if (!password)        { setError('請輸入密碼'); return; }
    setLoading(true); setError('');

    const { data, error: err } = await supabase.auth.signInWithPassword({
      email: toEmail(username),
      password,
    });

    if (err || !data.session) {
      setError(err?.message === 'Invalid login credentials' ? '帳號或密碼錯誤' : (err?.message ?? '登入失敗'));
      setLoading(false); return;
    }

    const u = data.session.user;
    onLogin({ user_id: u.id, username: u.user_metadata?.username ?? username.trim() });
    setLoading(false);
  };

  const handleSignup = async () => {
    if (!username.trim())    { setError('請輸入使用者名稱'); return; }
    if (password.length < 6) { setError('密碼至少 6 個字元'); return; }
    setLoading(true); setError('');

    const { data, error: err } = await supabase.auth.signUp({
      email: toEmail(username),
      password,
      options: { data: { username: username.trim() } },
    });

    if (err) { setError(err.message); setLoading(false); return; }

    const supabaseUser = data.user;
    if (!supabaseUser || (supabaseUser.identities && supabaseUser.identities.length === 0)) {
      setError('此使用者名稱已被使用');
      setLoading(false); return;
    }

    try {
      await createUser({ username: username.trim(), user_id: supabaseUser.id });
    } catch { /* 可能已存在，忽略 */ }

    if (!data.session) {
      setError('註冊失敗，請至 Supabase 關閉 Email 確認設定');
      setLoading(false); return;
    }

    onLogin({ user_id: supabaseUser.id, username: username.trim() });
    setLoading(false);
  };

  const submit = mode === 'login' ? handleLogin : handleSignup;

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

          {/* Tab */}
          <div style={{ display: 'flex', background: 'rgba(15,23,42,0.5)', borderRadius: 12, padding: 4, marginBottom: 24 }}>
            {(['login', 'signup'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); }}
                style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                  background: mode === m ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'transparent',
                  color: mode === m ? '#fff' : '#64748b' }}>
                {m === 'login' ? '登入' : '註冊'}
              </button>
            ))}
          </div>

          <Field label="使用者名稱">
            <Input placeholder="輸入名稱" value={username} autoFocus
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()} />
          </Field>

          <Field label="密碼">
            <Input type="password" placeholder={mode === 'signup' ? '至少 6 個字元' : '輸入密碼'} value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()} />
          </Field>

          {error && <p style={{ color: '#f87171', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{error}</p>}

          <PrimaryBtn onClick={submit} disabled={loading}>
            {loading ? (mode === 'login' ? '登入中…' : '註冊中…') : (mode === 'login' ? '登入' : '建立帳號')}
          </PrimaryBtn>
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
  return <button {...props} style={{ width: '100%', padding: 13, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4, opacity: props.disabled ? 0.6 : 1, ...props.style }}>{children}</button>;
}
