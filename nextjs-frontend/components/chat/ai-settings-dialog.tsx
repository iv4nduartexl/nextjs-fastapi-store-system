"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AISettings,
  fetchAISettings,
  listAIModels,
  resetAISettings,
  saveAISettings,
  testAIConnection,
} from "@/components/actions/ai-settings-action";
import type { ChatErrorCode } from "@/components/actions/chat-action";

interface AISettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

type Feedback = { ok: boolean; text: string } | null;

export function AISettingsDialog({ open, onClose }: AISettingsDialogProps) {
  const t = useTranslations("chat.settingsDialog");
  const tErrors = useTranslations("chat.errors");

  const [settings, setSettings] = useState<AISettings | null>(null);
  const [provider, setProvider] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [temperature, setTemperature] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<"load" | "models" | "test" | "save" | null>(
    null,
  );
  const [feedback, setFeedback] = useState<Feedback>(null);

  function applySettings(s: AISettings) {
    setSettings(s);
    setProvider(s.provider);
    setBaseUrl(s.base_url);
    setModel(s.model);
    setTemperature(s.temperature == null ? "" : String(s.temperature));
    setApiKey("");
    setClearKey(false);
  }

  useEffect(() => {
    if (!open) return;
    setFeedback(null);
    setModels([]);
    setBusy("load");
    fetchAISettings().then(({ data, error }) => {
      setBusy(null);
      if (data) applySettings(data);
      else setFeedback({ ok: false, text: error ?? tErrors("generic") });
    });
  }, [open, tErrors]);

  if (!open) return null;

  const preset = settings?.presets.find((p) => p.id === provider);
  const keyRequired = preset?.requires_key ?? true;

  function describeError(code: string | null | undefined, detail?: string | null) {
    const known = code && tErrors.has(code as ChatErrorCode);
    const base = known ? tErrors(code as ChatErrorCode) : tErrors("generic");
    return detail ? `${base} (${detail})` : base;
  }

  function draft() {
    return {
      provider,
      base_url: baseUrl.trim(),
      model: model.trim(),
      api_key: apiKey.trim() || undefined,
    };
  }

  function changeProvider(next: string) {
    setProvider(next);
    const nextPreset = settings?.presets.find((p) => p.id === next);
    if (nextPreset && next !== "custom") {
      setBaseUrl(nextPreset.base_url);
      setModel(nextPreset.default_model);
    }
    setModels([]);
    setFeedback(null);
  }

  async function loadModels() {
    setBusy("models");
    setFeedback(null);
    const { data, error } = await listAIModels(draft());
    setBusy(null);
    if (data?.models.length) {
      setModels(data.models);
      setFeedback({ ok: true, text: t("modelsLoaded", { count: data.models.length }) });
    } else {
      setFeedback({ ok: false, text: describeError(data?.error ?? error, data?.detail) });
    }
  }

  async function testConnection() {
    setBusy("test");
    setFeedback(null);
    const { data, error } = await testAIConnection(draft());
    setBusy(null);
    setFeedback(
      data?.ok
        ? { ok: true, text: t("testOk") }
        : { ok: false, text: describeError(data?.error ?? error, data?.detail) },
    );
  }

  async function save() {
    setBusy("save");
    setFeedback(null);
    const parsedTemperature = temperature.trim() === "" ? null : Number(temperature);
    const { data, error } = await saveAISettings({
      provider,
      base_url: baseUrl.trim(),
      model: model.trim(),
      temperature:
        parsedTemperature == null || Number.isNaN(parsedTemperature)
          ? null
          : parsedTemperature,
      api_key: apiKey.trim() || undefined,
      clear_api_key: clearKey,
    });
    setBusy(null);
    if (data) {
      applySettings(data);
      setFeedback({ ok: true, text: t("saved") });
    } else {
      setFeedback({ ok: false, text: error ?? tErrors("generic") });
    }
  }

  async function reset() {
    setBusy("save");
    await resetAISettings();
    const { data } = await fetchAISettings();
    setBusy(null);
    if (data) applySettings(data);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-800">{t("title")}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{t("description")}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label={t("cancel")}
          >
            <X size={16} />
          </button>
        </div>

        {busy === "load" || !settings ? (
          <div className="flex justify-center py-10 text-gray-400">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : (
          <div className="px-5 py-5 space-y-4">
            {!settings.is_custom && (
              <p className="text-xs rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-gray-600">
                {t("usingDefault")}
              </p>
            )}

            <div className="space-y-1.5">
              <Label>{t("provider")}</Label>
              <Select value={provider} onValueChange={changeProvider}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {settings.presets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai-base-url">{t("baseUrl")}</Label>
              <Input
                id="ai-base-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://…/v1"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="ai-model">{t("model")}</Label>
                <button
                  type="button"
                  onClick={loadModels}
                  disabled={busy !== null || !baseUrl.trim()}
                  className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
                >
                  {busy === "models" ? (
                    <Loader2 className="inline animate-spin" size={12} />
                  ) : (
                    t("loadModels")
                  )}
                </button>
              </div>
              <Input
                id="ai-model"
                list="ai-model-options"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                autoComplete="off"
              />
              <datalist id="ai-model-options">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <p className="text-[11px] text-gray-400">{t("modelHint")}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai-key">{t("apiKey")}</Label>
              <Input
                id="ai-key"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  if (e.target.value) setClearKey(false);
                }}
                placeholder={
                  settings.api_key_hint ? `••••${settings.api_key_hint}` : ""
                }
              />
              <p className="text-[11px] text-gray-400">
                {settings.has_api_key && settings.api_key_hint
                  ? t("apiKeySaved", { hint: settings.api_key_hint })
                  : keyRequired
                    ? t("apiKeyNone")
                    : t("apiKeyNotRequired")}
              </p>
              {settings.is_custom && settings.has_api_key && (
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={clearKey}
                    onChange={(e) => setClearKey(e.target.checked)}
                  />
                  {t("clearKey")}
                </label>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai-temperature">{t("temperature")}</Label>
              <Input
                id="ai-temperature"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                className="w-28"
              />
              <p className="text-[11px] text-gray-400">{t("temperatureHint")}</p>
            </div>

            {feedback && (
              <p
                className={`flex items-start gap-1.5 text-sm ${
                  feedback.ok ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {feedback.ok ? (
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                ) : (
                  <XCircle size={16} className="mt-0.5 shrink-0" />
                )}
                <span className="break-words min-w-0">{feedback.text}</span>
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {settings.is_custom ? (
                <button
                  type="button"
                  onClick={reset}
                  disabled={busy !== null}
                  className="text-xs text-gray-500 hover:text-gray-800 hover:underline"
                >
                  {t("reset")}
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={testConnection}
                  disabled={busy !== null || !baseUrl.trim() || !model.trim()}
                >
                  {busy === "test" && <Loader2 className="animate-spin" size={14} />}
                  {t("test")}
                </Button>
                <Button
                  onClick={save}
                  disabled={busy !== null || !baseUrl.trim() || !model.trim()}
                >
                  {busy === "save" && <Loader2 className="animate-spin" size={14} />}
                  {t("save")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
