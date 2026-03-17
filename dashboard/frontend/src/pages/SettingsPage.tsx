import { useState, useEffect } from "react";
import { api } from "../api/client";
import { SUPPORTED_TRACKERS } from "../types";
import type { Settings, Tracker, Seedbox, AutobrrConnectionStatus, TrackerType } from "../types";
import { useSettings, useUpdateSettings } from "../hooks/useSettings";
import { Card, CardHeader, CardTitle, CardContent, CardAction } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const genId = () => Math.random().toString(36).slice(2, 10);

const emptySettings: Settings = {
  autobrr_url: "",
  autobrr_api_key: "",
  trackers: [],
  seedboxes: [],
};

export default function SettingsPage() {
  const { data: loadedSettings } = useSettings();
  const updateSettingsMutation = useUpdateSettings();

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
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (loadedSettings) {
      setSettings(loadedSettings);
      setAutobrrForm({ autobrr_url: loadedSettings.autobrr_url, autobrr_api_key: loadedSettings.autobrr_api_key });
    }
  }, [loadedSettings]);

  const saving = updateSettingsMutation.isPending;

  const saveSettings = async (updated: Settings) => {
    setMessage(null);
    try {
      const saved = await updateSettingsMutation.mutateAsync(updated);
      setSettings(saved);
      setMessage({ type: "success", text: "Settings saved" });
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save" });
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
      <Card>
        <CardHeader>
          <CardTitle>Trackers</CardTitle>
          <CardAction>
            <Button
              onClick={handleAddTrackerOpen}
              disabled={allTypesConfigured || addingTracker}
              size="sm"
            >
              Add Tracker
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings.trackers.length === 0 && !addingTracker && (
            <p className="text-sm text-muted-foreground py-2">No trackers configured yet.</p>
          )}

          {settings.trackers.map((tracker) =>
            editingTrackerId === tracker.id && editingTracker ? (
              <div key={tracker.id} className="rounded-lg border border-border p-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Tracker</Label>
                  <Input
                    type="text"
                    value={editingTracker.tracker_type}
                    readOnly
                    className="opacity-60"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Username</Label>
                  <Input
                    type="text"
                    value={editingTracker.username}
                    onChange={(e) => setEditingTracker({ ...editingTracker, username: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Password</Label>
                  <Input
                    type="password"
                    value={editingTracker.password}
                    onChange={(e) => setEditingTracker({ ...editingTracker, password: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleEditTrackerSave} disabled={saving} size="sm">
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setEditingTrackerId(null); setEditingTracker(null); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div key={tracker.id} className="rounded-lg border border-border p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold">{tracker.tracker_type}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{tracker.username} · ••••••••</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="ghost" size="sm" onClick={() => handleEditTrackerOpen(tracker)}>
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDeleteTracker(tracker.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            )
          )}

          {addingTracker && (
            <div className="space-y-3 border-t border-border pt-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Tracker</Label>
                <select
                  value={newTracker.tracker_type}
                  onChange={(e) => setNewTracker({ ...newTracker, tracker_type: e.target.value as TrackerType })}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {availableTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Username</Label>
                <Input
                  type="text"
                  value={newTracker.username}
                  onChange={(e) => setNewTracker({ ...newTracker, username: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Password</Label>
                <Input
                  type="password"
                  value={newTracker.password}
                  onChange={(e) => setNewTracker({ ...newTracker, password: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddTrackerSave} disabled={saving} size="sm">
                  Save
                </Button>
                <Button variant="outline" size="sm" onClick={() => setAddingTracker(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2 — Seedboxes */}
      <Card>
        <CardHeader>
          <CardTitle>Seedboxes</CardTitle>
          <CardAction>
            <Button onClick={handleAddSeedboxOpen} disabled={addingSeedbox} size="sm">
              Add Seedbox
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings.seedboxes.length === 0 && !addingSeedbox && (
            <p className="text-sm text-muted-foreground py-2">No seedboxes configured yet.</p>
          )}

          {settings.seedboxes.map((seedbox) =>
            editingSeedboxId === seedbox.id && editingSeedbox ? (
              <div key={seedbox.id} className="rounded-lg border border-border p-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    type="text"
                    value={editingSeedbox.name}
                    onChange={(e) => setEditingSeedbox({ ...editingSeedbox, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Storage (TB)</Label>
                  <Input
                    type="number"
                    step={0.5}
                    min={0.5}
                    value={editingSeedbox.storage_tb}
                    onChange={(e) => setEditingSeedbox({ ...editingSeedbox, storage_tb: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleEditSeedboxSave} disabled={saving} size="sm">
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setEditingSeedboxId(null); setEditingSeedbox(null); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div key={seedbox.id} className="rounded-lg border border-border p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold">{seedbox.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{seedbox.storage_tb} TB</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="ghost" size="sm" onClick={() => handleEditSeedboxOpen(seedbox)}>
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDeleteSeedbox(seedbox.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            )
          )}

          {addingSeedbox && (
            <div className="space-y-3 border-t border-border pt-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input
                  type="text"
                  value={newSeedbox.name}
                  onChange={(e) => setNewSeedbox({ ...newSeedbox, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Storage (TB)</Label>
                <Input
                  type="number"
                  step={0.5}
                  min={0.5}
                  value={newSeedbox.storage_tb}
                  onChange={(e) => setNewSeedbox({ ...newSeedbox, storage_tb: parseFloat(e.target.value) })}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddSeedboxSave} disabled={saving} size="sm">
                  Save
                </Button>
                <Button variant="outline" size="sm" onClick={() => setAddingSeedbox(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3 — Autobrr Connection */}
      <Card>
        <CardHeader>
          <CardTitle>Autobrr Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Autobrr URL</Label>
            <Input
              type="text"
              value={autobrrForm.autobrr_url}
              onChange={(e) => setAutobrrForm({ ...autobrrForm, autobrr_url: e.target.value })}
              placeholder="http://localhost:7474"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">API Key</Label>
            <Input
              type="password"
              value={autobrrForm.autobrr_api_key}
              onChange={(e) => setAutobrrForm({ ...autobrrForm, autobrr_api_key: e.target.value })}
              placeholder="Enter your autobrr API key"
            />
          </div>

          <div className="flex gap-3">
            <Button onClick={handleAutobrrSave} disabled={saving} size="sm">
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" onClick={handleTestConnection} disabled={testing} size="sm">
              {testing ? "Testing..." : "Test Connection"}
            </Button>
          </div>

          {message && (
            <div
              className={
                message.type === "success"
                  ? "text-sm px-3 py-2 rounded-lg bg-green-900/50 border border-green-700 text-green-300"
                  : "text-sm px-3 py-2 rounded-lg bg-red-900/50 border border-red-700 text-red-300"
              }
            >
              {message.text}
            </div>
          )}

          {connectionStatus && (
            <div
              className={
                connectionStatus.connected
                  ? "text-sm px-3 py-2 rounded-lg bg-green-900/50 border border-green-700 text-green-300"
                  : "text-sm px-3 py-2 rounded-lg bg-red-900/50 border border-red-700 text-red-300"
              }
            >
              {connectionStatus.connected
                ? `Connected — ${connectionStatus.filter_count} filters found in autobrr`
                : `Connection failed: ${connectionStatus.error}`}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
