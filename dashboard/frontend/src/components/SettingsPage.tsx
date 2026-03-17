import { useState, useEffect } from "react";
import { api } from "../api/client";
import { SUPPORTED_TRACKERS } from "../types";
import type { Settings, Tracker, Seedbox, AutobrrConnectionStatus, TrackerType } from "../types";

const genId = () => Math.random().toString(36).slice(2, 10);

const emptySettings: Settings = {
  autobrr_url: "",
  autobrr_api_key: "",
  trackers: [],
  seedboxes: [],
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(emptySettings);

  // Tracker state
  const [editingTrackerId, setEditingTrackerId] = useState<string | null>(null);
  const [addingTracker, setAddingTracker] = useState(false);
  const [newTracker, setNewTracker] = useState<{ tracker_type: TrackerType; username: string; password: string }>({
    tracker_type: SUPPORTED_TRACKERS[0],
    username: "",
    password: "",
  });
  const [editingTracker, setEditingTracker] = useState<Tracker | null>(null);

  // Seedbox state
  const [editingSeedboxId, setEditingSeedboxId] = useState<string | null>(null);
  const [addingSeedbox, setAddingSeedbox] = useState(false);
  const [newSeedbox, setNewSeedbox] = useState<{ name: string; storage_tb: number }>({ name: "", storage_tb: 1 });
  const [editingSeedbox, setEditingSeedbox] = useState<Seedbox | null>(null);

  // Autobrr form state
  const [autobrrForm, setAutobrrForm] = useState<{ autobrr_url: string; autobrr_api_key: string }>({
    autobrr_url: "",
    autobrr_api_key: "",
  });
  const [connectionStatus, setConnectionStatus] = useState<AutobrrConnectionStatus | null>(null);

  // Shared state
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s);
      setAutobrrForm({ autobrr_url: s.autobrr_url, autobrr_api_key: s.autobrr_api_key });
    }).catch(() => {});
  }, []);

  const saveSettings = async (updated: Settings) => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await api.updateSettings(updated);
      setSettings(saved);
      setMessage({ type: "success", text: "Settings saved" });
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  // --- Tracker handlers ---

  const configuredTypes = new Set(settings.trackers.map((t) => t.tracker_type));
  const availableTypes = SUPPORTED_TRACKERS.filter((t) => !configuredTypes.has(t));
  const allTypesConfigured = availableTypes.length === 0;

  const handleAddTrackerOpen = () => {
    const firstAvailable = availableTypes[0] ?? SUPPORTED_TRACKERS[0];
    setNewTracker({ tracker_type: firstAvailable, username: "", password: "" });
    setAddingTracker(true);
  };

  const handleAddTrackerSave = async () => {
    const tracker: Tracker = { id: genId(), ...newTracker };
    const updated = { ...settings, trackers: [...settings.trackers, tracker] };
    await saveSettings(updated);
    setAddingTracker(false);
  };

  const handleEditTrackerOpen = (tracker: Tracker) => {
    setEditingTracker({ ...tracker });
    setEditingTrackerId(tracker.id);
  };

  const handleEditTrackerSave = async () => {
    if (!editingTracker) return;
    const updated = {
      ...settings,
      trackers: settings.trackers.map((t) => (t.id === editingTracker.id ? editingTracker : t)),
    };
    await saveSettings(updated);
    setEditingTrackerId(null);
    setEditingTracker(null);
  };

  const handleDeleteTracker = async (id: string) => {
    if (!confirm("Delete this tracker?")) return;
    const updated = { ...settings, trackers: settings.trackers.filter((t) => t.id !== id) };
    await saveSettings(updated);
  };

  // --- Seedbox handlers ---

  const handleAddSeedboxOpen = () => {
    setNewSeedbox({ name: "", storage_tb: 1 });
    setAddingSeedbox(true);
  };

  const handleAddSeedboxSave = async () => {
    const seedbox: Seedbox = { id: genId(), ...newSeedbox };
    const updated = { ...settings, seedboxes: [...settings.seedboxes, seedbox] };
    await saveSettings(updated);
    setAddingSeedbox(false);
  };

  const handleEditSeedboxOpen = (seedbox: Seedbox) => {
    setEditingSeedbox({ ...seedbox });
    setEditingSeedboxId(seedbox.id);
  };

  const handleEditSeedboxSave = async () => {
    if (!editingSeedbox) return;
    const updated = {
      ...settings,
      seedboxes: settings.seedboxes.map((s) => (s.id === editingSeedbox.id ? editingSeedbox : s)),
    };
    await saveSettings(updated);
    setEditingSeedboxId(null);
    setEditingSeedbox(null);
  };

  const handleDeleteSeedbox = async (id: string) => {
    if (!confirm("Delete this seedbox?")) return;
    const updated = { ...settings, seedboxes: settings.seedboxes.filter((s) => s.id !== id) };
    await saveSettings(updated);
  };

  // --- Autobrr handlers ---

  const handleAutobrrSave = async () => {
    const updated = { ...settings, ...autobrrForm };
    await saveSettings(updated);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setConnectionStatus(null);
    setMessage(null);
    try {
      const result = await api.testAutobrrConnection(autobrrForm);
      setConnectionStatus(result);
    } catch (err: unknown) {
      setConnectionStatus({ connected: false, error: err instanceof Error ? err.message : "Connection failed" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Section 1 — Trackers */}
      <div className="rounded-lg bg-gray-900 border border-gray-800 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Trackers</h2>
          <button
            onClick={handleAddTrackerOpen}
            disabled={allTypesConfigured || addingTracker}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Add Tracker
          </button>
        </div>

        {settings.trackers.length === 0 && !addingTracker && (
          <p className="text-sm text-gray-500 py-2">No trackers configured yet.</p>
        )}

        {settings.trackers.map((tracker) =>
          editingTrackerId === tracker.id && editingTracker ? (
            <div key={tracker.id} className="rounded-lg bg-gray-800/50 border border-gray-700 p-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Tracker</label>
                  <input
                    type="text"
                    value={editingTracker.tracker_type}
                    readOnly
                    className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Username</label>
                  <input
                    type="text"
                    value={editingTracker.username}
                    onChange={(e) => setEditingTracker({ ...editingTracker, username: e.target.value })}
                    className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Password</label>
                  <input
                    type="password"
                    value={editingTracker.password}
                    onChange={(e) => setEditingTracker({ ...editingTracker, password: e.target.value })}
                    className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleEditTrackerSave}
                    disabled={saving}
                    className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setEditingTrackerId(null); setEditingTracker(null); }}
                    className="rounded bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-200 hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div key={tracker.id} className="rounded-lg bg-gray-800/50 border border-gray-700 p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-100">{tracker.tracker_type}</p>
                <p className="text-xs text-gray-400 mt-0.5">{tracker.username} · ••••••••</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleEditTrackerOpen(tracker)}
                  className="text-xs text-gray-400 hover:text-gray-200"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteTracker(tracker.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </div>
            </div>
          )
        )}

        {addingTracker && (
          <div className="mt-3 space-y-3 border-t border-gray-700 pt-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Tracker</label>
              <select
                value={newTracker.tracker_type}
                onChange={(e) => setNewTracker({ ...newTracker, tracker_type: e.target.value as TrackerType })}
                className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {availableTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Username</label>
              <input
                type="text"
                value={newTracker.username}
                onChange={(e) => setNewTracker({ ...newTracker, username: e.target.value })}
                className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Password</label>
              <input
                type="password"
                value={newTracker.password}
                onChange={(e) => setNewTracker({ ...newTracker, password: e.target.value })}
                className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddTrackerSave}
                disabled={saving}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => setAddingTracker(false)}
                className="rounded bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-200 hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Section 2 — Seedboxes */}
      <div className="rounded-lg bg-gray-900 border border-gray-800 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Seedboxes</h2>
          <button
            onClick={handleAddSeedboxOpen}
            disabled={addingSeedbox}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Add Seedbox
          </button>
        </div>

        {settings.seedboxes.length === 0 && !addingSeedbox && (
          <p className="text-sm text-gray-500 py-2">No seedboxes configured yet.</p>
        )}

        {settings.seedboxes.map((seedbox) =>
          editingSeedboxId === seedbox.id && editingSeedbox ? (
            <div key={seedbox.id} className="rounded-lg bg-gray-800/50 border border-gray-700 p-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={editingSeedbox.name}
                    onChange={(e) => setEditingSeedbox({ ...editingSeedbox, name: e.target.value })}
                    className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Storage (TB)</label>
                  <input
                    type="number"
                    step={0.5}
                    min={0.5}
                    value={editingSeedbox.storage_tb}
                    onChange={(e) => setEditingSeedbox({ ...editingSeedbox, storage_tb: parseFloat(e.target.value) })}
                    className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleEditSeedboxSave}
                    disabled={saving}
                    className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setEditingSeedboxId(null); setEditingSeedbox(null); }}
                    className="rounded bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-200 hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div key={seedbox.id} className="rounded-lg bg-gray-800/50 border border-gray-700 p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-100">{seedbox.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{seedbox.storage_tb} TB</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleEditSeedboxOpen(seedbox)}
                  className="text-xs text-gray-400 hover:text-gray-200"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteSeedbox(seedbox.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </div>
            </div>
          )
        )}

        {addingSeedbox && (
          <div className="mt-3 space-y-3 border-t border-gray-700 pt-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={newSeedbox.name}
                onChange={(e) => setNewSeedbox({ ...newSeedbox, name: e.target.value })}
                className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Storage (TB)</label>
              <input
                type="number"
                step={0.5}
                min={0.5}
                value={newSeedbox.storage_tb}
                onChange={(e) => setNewSeedbox({ ...newSeedbox, storage_tb: parseFloat(e.target.value) })}
                className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddSeedboxSave}
                disabled={saving}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => setAddingSeedbox(false)}
                className="rounded bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-200 hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Section 3 — Autobrr Connection */}
      <div className="rounded-lg bg-gray-900 border border-gray-800 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Autobrr Connection</h2>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Autobrr URL</label>
          <input
            type="text"
            value={autobrrForm.autobrr_url}
            onChange={(e) => setAutobrrForm({ ...autobrrForm, autobrr_url: e.target.value })}
            placeholder="http://localhost:7474"
            className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">API Key</label>
          <input
            type="password"
            value={autobrrForm.autobrr_api_key}
            onChange={(e) => setAutobrrForm({ ...autobrrForm, autobrr_api_key: e.target.value })}
            placeholder="Enter your autobrr API key"
            className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleAutobrrSave}
            disabled={saving}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="rounded bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-200 hover:bg-gray-600 disabled:opacity-50"
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
        </div>

        {message && (
          <div
            className={
              message.type === "success"
                ? "text-sm px-3 py-2 rounded bg-green-900/50 border border-green-700 text-green-300"
                : "text-sm px-3 py-2 rounded bg-red-900/50 border border-red-700 text-red-300"
            }
          >
            {message.text}
          </div>
        )}

        {connectionStatus && (
          <div
            className={
              connectionStatus.connected
                ? "text-sm px-3 py-2 rounded bg-green-900/50 border border-green-700 text-green-300"
                : "text-sm px-3 py-2 rounded bg-red-900/50 border border-red-700 text-red-300"
            }
          >
            {connectionStatus.connected
              ? `Connected — ${connectionStatus.filter_count} filters found in autobrr`
              : `Connection failed: ${connectionStatus.error}`}
          </div>
        )}
      </div>
    </div>
  );
}
