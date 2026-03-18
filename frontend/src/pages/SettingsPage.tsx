import { useState } from "react";
import type { Settings } from "../types";
import { useSettings, useUpdateSettings } from "../hooks/useSettings";
import { useToast } from "../components/Toast";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { api } from "../api/client";

const emptySettings: Settings = {
  autobrr_url: "",
  autobrr_api_key: "",
  trackers: [],
  seedboxes: [],
};

export default function SettingsPage() {
  const { data: loadedSettings } = useSettings();
  const updateSettingsMutation = useUpdateSettings();

  // Local overrides on top of server state — only populated while user is making edits
  const [localSettings, setLocalSettings] = useState<Settings | null>(null);
  const settings: Settings = localSettings ?? loadedSettings ?? emptySettings;
  const setSettings = (s: Settings) => setLocalSettings(s);

  const { toast } = useToast();

  const [testing, setTesting] = useState(false);
  const [savingSection, setSavingSection] = useState<string | null>(null);

  const saveSettings = async (updated: Settings, section: string) => {
    setSavingSection(section);
    try {
      await updateSettingsMutation.mutateAsync(updated);
      setLocalSettings(null);
      toast("Settings saved");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSavingSection(null);
    }
  };

  // --- Autobrr handlers ---

  const handleAutobrrSave = async () => {
    await saveSettings(settings, 'autobrr');
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const result = await api.testAutobrrConnection({ autobrr_url: settings.autobrr_url, autobrr_api_key: settings.autobrr_api_key });
      if (result.connected) {
        toast(`Connected — ${result.filter_count} filters found in autobrr`);
      } else {
        toast(`Connection failed: ${result.error}`, "error");
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Connection failed", "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Autobrr Connection */}
      <Card>
        <CardHeader>
          <CardTitle>Autobrr Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Autobrr URL</Label>
            <Input
              type="text"
              value={settings.autobrr_url}
              onChange={(e) => setSettings({ ...settings, autobrr_url: e.target.value })}
              placeholder="http://localhost:7474"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">API Key</Label>
            <Input
              type="text"
              value={settings.autobrr_api_key}
              onChange={(e) => setSettings({ ...settings, autobrr_api_key: e.target.value })}
              placeholder="Enter your autobrr API key"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore
            />
          </div>

          <div className="flex gap-3">
            <Button onClick={handleAutobrrSave} disabled={savingSection === 'autobrr'} size="sm">
              {savingSection === 'autobrr' ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" onClick={handleTestConnection} disabled={testing} size="sm">
              {testing ? "Testing..." : "Test Connection"}
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
