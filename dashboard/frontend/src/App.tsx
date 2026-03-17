import { Routes, Route } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAppStore } from './store/app.store';
import SimulatorPage from './pages/SimulatorPage';
import DatasetsPage from './pages/DatasetsPage';
import FiltersPage from './pages/FiltersPage';
import SettingsPage from './pages/SettingsPage';
import SyncPage from './pages/SyncPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import RequireAuth from './auth/RequireAuth';

const TABS = [
  { value: 'simulator', label: 'Simulator' },
  { value: 'datasets', label: 'Datasets' },
  { value: 'filters', label: 'Filters' },
  { value: 'sync', label: 'Sync' },
  { value: 'settings', label: 'Settings' },
];

function Dashboard() {
  const { activeTab, setActiveTab } = useAppStore();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b px-6 py-3">
        <h1 className="text-lg font-semibold">filterbrr</h1>
      </header>
      <main className="px-6 py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {TABS.map(t => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
          </TabsList>
          <div className="mt-4">
            <TabsContent value="simulator"><SimulatorPage /></TabsContent>
            <TabsContent value="datasets"><DatasetsPage /></TabsContent>
            <TabsContent value="filters"><FiltersPage /></TabsContent>
            <TabsContent value="sync"><SyncPage /></TabsContent>
            <TabsContent value="settings"><SettingsPage /></TabsContent>
          </div>
        </Tabs>
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
