import { useEffect, useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
// @ts-ignore
import FridgeManagerDemo from './FridgeManagerDemo';
import { supabase } from './lib/supabase';
import { getUserById, createUser } from './api/client';
import type { User } from './api/types';

function AppInner() {
  if (window.location.pathname === '/demo') return <FridgeManagerDemo />;

  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  const ensureBackendUser = async (id: string, username: string) => {
    try { await getUserById(id); }
    catch { await createUser({ user_id: id, username }).catch(() => {}); }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u = session.user;
        const username = u.user_metadata?.username ?? u.email ?? 'user';
        ensureBackendUser(u.id, username);
        setUser({ user_id: u.id, username });
      }
      setChecking(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const u = session.user;
        const username = u.user_metadata?.username ?? u.email ?? 'user';
        ensureBackendUser(u.id, username);
        setUser({ user_id: u.id, username });
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (checking) return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #334155', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  );

  if (!user) return <LoginPage />;
  return <DashboardPage user={user} onLogout={handleLogout} />;
}

export default function App() {
  return <ThemeProvider><AppInner /></ThemeProvider>;
}
