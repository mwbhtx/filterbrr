import { useState } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { useThemeStore } from './store/theme.store';
import { Moon, Sun, LogOut, Menu, X } from 'lucide-react';
import { logout } from './auth/auth';
import SimulatorPage from './pages/SimulatorPage';
import DatasetsPage from './pages/DatasetsPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import VerifyPage from './pages/VerifyPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import RequireAuth from './auth/RequireAuth';
import { useIsDemo } from './auth/useIsDemo';

const TABS = [
  { path: '/simulator', label: 'Simulator' },
  { path: '/datasets', label: 'Scrape' },
  { path: '/settings', label: 'Settings' },
];

function Dashboard() {
  const isDemo = useIsDemo();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const visibleTabs = isDemo
    ? TABS.filter(t => t.path === '/simulator')
    : TABS;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b px-4 md:px-6 py-3 shrink-0 flex items-center gap-4 md:gap-6 relative">
        <div className="flex items-center gap-2">
          <img src="/logo-solid.svg" alt="filterbrr" className="h-9 w-auto brightness-0 invert" />
          <span className="text-base font-semibold tracking-tight">filterbrr</span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex gap-1">
          {visibleTabs.map(t => (
            <NavLink
              key={t.path}
              to={t.path}
              className={({ isActive }) =>
                `px-3 py-1.5 text-sm rounded-md transition-colors ${
                  isActive
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <button onClick={toggleTheme} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <button onClick={handleLogout} className="hidden md:inline-flex p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            <LogOut className="size-4" />
          </button>
          {/* Hamburger button — mobile only */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {/* Mobile dropdown menu */}
        {menuOpen && (
          <nav className="md:hidden absolute top-full left-0 right-0 bg-background border-b z-50 px-4 py-3 flex flex-col gap-1">
            {visibleTabs.map(t => (
              <NavLink
                key={t.path}
                to={t.path}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `px-3 py-2 text-sm rounded-md transition-colors ${
                    isActive
                      ? 'bg-muted text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`
                }
              >
                {t.label}
              </NavLink>
            ))}
            <button
              onClick={() => { setMenuOpen(false); handleLogout(); }}
              className="px-3 py-2 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-left"
            >
              Log out
            </button>
          </nav>
        )}
      </header>
      <main className="flex-1 px-4 md:px-6 py-4">
        <Routes>
          <Route path="/simulator" element={<SimulatorPage />} />
          {!isDemo && <Route path="/datasets" element={<DatasetsPage />} />}
          {!isDemo && <Route path="/settings" element={<SettingsPage />} />}
          <Route path="*" element={<SimulatorPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/verify" element={<VerifyPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/*" element={<RequireAuth><Dashboard /></RequireAuth>} />
    </Routes>
  );
}
