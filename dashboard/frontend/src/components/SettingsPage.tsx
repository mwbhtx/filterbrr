import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { AutobrrSettings, AutobrrConnectionStatus } from "../types";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AutobrrSettings>({
    autobrr_url: "",
    autobrr_api_key: "",
  });
  const [status, setStatus] = useState<AutobrrConnectionStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.updateSettings(settings);
      setMessage({ type: "success", text: "Settings saved" });
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setStatus(null);
    setMessage(null);
    try {
      const result = await api.getAutobrrStatus();
      setStatus(result);
    } catch (err: unknown) {
      setStatus({ connected: false, error: err instanceof Error ? err.message : "Connection failed" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      <h2 className="text-base font-semibold">Autobrr Connection</h2>

      <div className="space-y-4 rounded-lg bg-gray-900 border border-gray-800 p-5">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Autobrr URL</label>
          <input
            type="text"
            value={settings.autobrr_url}
            onChange={(e) => setSettings({ ...settings, autobrr_url: e.target.value })}
            placeholder="http://localhost:7474"
            className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">API Key</label>
          <input
            type="password"
            value={settings.autobrr_api_key}
            onChange={(e) => setSettings({ ...settings, autobrr_api_key: e.target.value })}
            placeholder="Enter your autobrr API key"
            className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={handleTest}
            disabled={testing}
            className="rounded bg-gray-700 px-4 py-1.5 text-sm font-medium text-gray-200 hover:bg-gray-600 disabled:opacity-50"
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
        </div>

        {message && (
          <div
            className={`text-sm px-3 py-2 rounded ${
              message.type === "success"
                ? "bg-green-900/50 border border-green-700 text-green-300"
                : "bg-red-900/50 border border-red-700 text-red-300"
            }`}
          >
            {message.text}
          </div>
        )}

        {status && (
          <div
            className={`text-sm px-3 py-2 rounded ${
              status.connected
                ? "bg-green-900/50 border border-green-700 text-green-300"
                : "bg-red-900/50 border border-red-700 text-red-300"
            }`}
          >
            {status.connected
              ? `Connected — ${status.filter_count} filters found in autobrr`
              : `Connection failed: ${status.error}`}
          </div>
        )}
      </div>
    </div>
  );
}
