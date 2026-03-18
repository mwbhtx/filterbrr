import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { useThemeStore } from './store/theme.store';
import { Moon, Sun, LogOut } from 'lucide-react';
import { logout } from './auth/auth';
import SimulatorPage from './pages/SimulatorPage';
import DatasetsPage from './pages/DatasetsPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import RequireAuth from './auth/RequireAuth';

const TABS = [
  { path: '/simulator', label: 'Simulator' },
  { path: '/datasets', label: 'Scrape' },
  { path: '/settings', label: 'Settings' },
];

function Dashboard() {
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b px-6 py-3 shrink-0 flex items-center gap-6">
        <h1 className="text-lg font-semibold">filterbrr</h1>
        <nav className="flex gap-1">
          {TABS.map(t => (
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
          <button onClick={handleLogout} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            <LogOut className="size-4" />
          </button>
        </div>
      </header>
      <main className="flex-1 px-6 py-4">
        <Routes>
          <Route path="/simulator" element={<SimulatorPage />} />
          <Route path="/datasets" element={<DatasetsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
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
      <Route path="/*" element={<RequireAuth><Dashboard /></RequireAuth>} />
    </Routes>
  );
}
