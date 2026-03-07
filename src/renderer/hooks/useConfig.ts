// Hook for reading and writing the persisted AppConfig via IPC

import { useState, useEffect, useCallback } from "react";
import type { AppConfig, PowerState } from "../types/index.js";

interface UseConfigReturn {
  config: AppConfig | null;
  loading: boolean;
  saving: boolean;
  availableModels: string[];
  powerState: PowerState;
  updateConfig: (partial: Partial<AppConfig>) => Promise<void>;
  refreshModels: () => Promise<void>;
}

export function useConfig(): UseConfigReturn {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [powerState, setPowerState] = useState<PowerState>({ onBattery: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, ps] = await Promise.all([
        window.api.getConfig(),
        window.api.getPowerState(),
      ]);
      setConfig(cfg);
      setPowerState(ps);
    } catch {
      // ignore — will show empty state
    }
    setLoading(false);
  }, []);

  const refreshModels = useCallback(async () => {
    try {
      const models = await window.api.getAvailableModels();
      setAvailableModels(models);
    } catch {
      setAvailableModels([]);
    }
  }, []);

  useEffect(() => {
    load();
    refreshModels();
  }, [load, refreshModels]);

  const updateConfig = useCallback(async (partial: Partial<AppConfig>) => {
    setSaving(true);
    try {
      const updated = await window.api.setConfig(partial);
      setConfig(updated);
    } catch {
      // ignore
    }
    setSaving(false);
  }, []);

  return { config, loading, saving, availableModels, powerState, updateConfig, refreshModels };
}
