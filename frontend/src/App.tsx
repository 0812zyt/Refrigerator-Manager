import { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
// @ts-ignore
import FridgeManagerDemo from './FridgeManagerDemo';
import type { User } from './api/types';

function AppInner() {
  if (window.location.pathname === '/demo') return <FridgeManagerDemo />;

  const [user, setUser] = useState<User | null>(() => {
    try { return JSON.parse(localStorage.getItem('fridgeUser') || 'null'); } catch { return null; }
  });

  const handleLogin = (u: User) => { localStorage.setItem('fridgeUser', JSON.stringify(u)); setUser(u); };
  const handleLogout = () => { localStorage.removeItem('fridgeUser'); setUser(null); };

  if (!user) return <LoginPage onLogin={handleLogin} />;
  return <DashboardPage user={user} onLogout={handleLogout} />;
}

export default function App() {
  return <ThemeProvider><AppInner /></ThemeProvider>;
}
