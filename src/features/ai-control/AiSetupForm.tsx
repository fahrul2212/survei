import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, KeyRound, RefreshCw, Save, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button, type Notice } from "../../components/ui";
import { getAiModels, updateAiSettings } from "./api";
import type { AiModelOption, AiSettingsResponse } from "./types";

const inputClass = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100";
const labelClass = "grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500";

type Props = {
  configuration: AiSettingsResponse;
  onSaved: () => Promise<void>;
  setNotice: (notice: Notice) => void;
};

export function AiSetupForm({ configuration, onSaved, setNotice }: Props) {
  const { settings, pricing, credential } = configuration;
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState(settings.defaultModel);
  const [inputPrice, setInputPrice] = useState(pricing?.inputPricePerMillionUsd ?? 0);
  const [outputPrice, setOutputPrice] = useState(pricing?.outputPricePerMillionUsd ?? 0);
  const [busy, setBusy] = useState<"models" | "save" | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelsError, setModelsError] = useState("");

  const selectedOption = useMemo(
    () => models.find((model) => model.id === selectedModel) ?? null,
    [models, selectedModel],
  );

  const applyModel = useCallback((model: AiModelOption | undefined) => {
    if (!model) return;
    setSelectedModel(model.id);
    if (model.pricing) {
      setInputPrice(model.pricing.inputPricePerMillionUsd);
      setOutputPrice(model.pricing.outputPricePerMillionUsd);
    } else if (model.id !== settings.defaultModel) {
      setInputPrice(0);
      setOutputPrice(0);
    }
  }, [settings.defaultModel]);

  const loadModels = useCallback(async (showSuccess: boolean, candidateKey = "") => {
    setBusy("models");
    setModelsError("");
    try {
      const result = await getAiModels(candidateKey.trim() || undefined);
      setModels(result.models);
      setModelsLoaded(true);
      const saved = result.models.find((model) => model.id === settings.defaultModel);
      const recommended = result.models.find((model) => model.id === result.recommendedModel);
      applyModel(saved && (pricing || saved.pricing) ? saved : recommended ?? saved ?? result.models[0]);
      if (showSuccess) setNotice({ kind: "success", message: `${result.models.length} compatible OpenAI models loaded.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load OpenAI models";
      setModelsError(message);
      if (showSuccess) setNotice({ kind: "error", message });
    } finally {
      setBusy(null);
    }
  }, [applyModel, pricing, setNotice, settings.defaultModel]);

  useEffect(() => {
    if (credential.configured) void loadModels(false);
  }, [credential.configured, loadModels]);

  function changeModel(modelId: string) {
    applyModel(models.find((model) => model.id === modelId));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy("save");
    try {
      await updateAiSettings({
        enabled: values.get("enabled") === "on",
        defaultModel: selectedModel,
        fallbackModel: String(values.get("fallbackModel") ?? "").trim() || null,
        monthlyBudgetUsd: Number(values.get("monthlyBudgetUsd")),
        companyMonthlyBudgetUsd: String(values.get("companyMonthlyBudgetUsd") ?? "").trim()
          ? Number(values.get("companyMonthlyBudgetUsd")) : null,
        maxOutputTokens: Number(values.get("maxOutputTokens")),
        benchmarkMinimum: Number(values.get("benchmarkMinimum")),
        inputPricePerMillionUsd: inputPrice,
        outputPricePerMillionUsd: outputPrice,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      setApiKey("");
      setNotice({ kind: "success", message: "OpenAI connection and AI settings saved securely." });
      await onSaved();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to save AI settings" });
    } finally {
      setBusy(null);
    }
  }

  const priceIsAutomatic = Boolean(selectedOption?.pricing);
  const canLoadModels = Boolean(apiKey.trim() || credential.configured);

  return (
    <form onSubmit={save} className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
        <h2 className="text-base font-bold text-slate-900">Connect OpenAI</h2>
        <p className="mt-1 text-xs text-slate-500">Paste the key, load its available models, then choose one from the list.</p>
      </div>

      <div className="grid gap-5 p-5 sm:p-6">
        <label className={labelClass}>
          <span className="flex items-center justify-between gap-3">
            <span>OpenAI API key</span>
            <span className={`normal-case tracking-normal ${credential.configured ? "text-emerald-700" : "text-amber-700"}`}>
              {credential.configured ? `Saved securely${credential.suffix ? ` · ••••${credential.suffix}` : ""}` : "Not configured"}
            </span>
          </span>
          <input
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              setModelsLoaded(false);
              setModelsError("");
            }}
            type="password"
            autoComplete="new-password"
            className={inputClass}
            placeholder={credential.configured ? "Leave blank to keep the saved key" : "Paste your OpenAI project key"}
          />
          <span className="normal-case tracking-normal text-slate-400">The key is sent only to the protected Worker, encrypted, and never returned to this page.</span>
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className={`${labelClass} min-w-0 flex-1`}>
            <span>Model</span>
            <select
              value={selectedModel}
              onChange={(event) => changeModel(event.target.value)}
              className={inputClass}
              disabled={!modelsLoaded}
            >
              {!modelsLoaded && <option value={selectedModel}>{selectedModel} · connect to load models</option>}
              {models.map((model) => <option key={model.id} value={model.id}>{model.id}{model.pricing ? " · automatic pricing" : ""}</option>)}
            </select>
          </label>
          <Button
            type="button"
            variant="secondary"
            icon={RefreshCw}
            disabled={busy !== null || !canLoadModels}
            onClick={() => void loadModels(true, apiKey)}
          >
            {busy === "models" ? "Loading…" : credential.configured && !apiKey ? "Refresh models" : "Connect & load models"}
          </Button>
        </div>

        {modelsLoaded && (
          <div className={`flex items-start gap-3 rounded-lg border p-4 ${priceIsAutomatic ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <ShieldCheck size={18} className={`mt-0.5 shrink-0 ${priceIsAutomatic ? "text-emerald-700" : "text-amber-700"}`} />
            <p className="text-xs leading-5 text-slate-700">
              {priceIsAutomatic
                ? `Pricing filled automatically from the verified catalogue (${selectedOption?.pricing?.verifiedAt}).`
                : "This model has no catalogue price. Enter its current price under Advanced settings before enabling AI."}
            </p>
          </div>
        )}

        {modelsError && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <TriangleAlert size={18} className="mt-0.5 shrink-0 text-red-700" />
            <p className="text-xs leading-5 text-red-800">{modelsError}. Check the key and try again.</p>
          </div>
        )}

        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <input name="enabled" type="checkbox" defaultChecked={settings.enabled} className="mt-0.5 size-4 accent-[#d91f17]" />
          <span><strong className="block text-sm text-slate-900">Enable AI after saving</strong><span className="mt-1 block text-xs leading-5 text-slate-500">AI remains blocked when no key or valid model pricing is available.</span></span>
        </label>

        <details className="group rounded-lg border border-slate-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d91f17]">
            Advanced limits and pricing
            <ChevronDown size={17} className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <div className="grid gap-4 border-t border-slate-200 p-4 sm:grid-cols-2">
            <label className={labelClass}>Fallback model<input name="fallbackModel" defaultValue={settings.fallbackModel ?? ""} className={inputClass} placeholder="Optional" /></label>
            <label className={labelClass}>Monthly budget (USD)<input name="monthlyBudgetUsd" type="number" min="0" max="1000000" step="0.01" required defaultValue={settings.monthlyBudgetUsd} className={inputClass} /></label>
            <label className={labelClass}>Per-company budget (USD)<input name="companyMonthlyBudgetUsd" type="number" min="0" max="1000000" step="0.01" defaultValue={settings.companyMonthlyBudgetUsd ?? ""} className={inputClass} placeholder="No separate limit" /></label>
            <label className={labelClass}>Maximum output tokens<input name="maxOutputTokens" type="number" min="128" max="32768" required defaultValue={settings.maxOutputTokens} className={inputClass} /></label>
            <label className={labelClass}>Benchmark minimum<input name="benchmarkMinimum" type="number" min="5" max="100" required defaultValue={settings.benchmarkMinimum} className={inputClass} /></label>
            <label className={labelClass}>Input price / 1M tokens<input value={inputPrice} onChange={(event) => setInputPrice(Number(event.target.value))} type="number" min="0" max="100000" step="0.000001" required className={inputClass} /></label>
            <label className={labelClass}>Output price / 1M tokens<input value={outputPrice} onChange={(event) => setOutputPrice(Number(event.target.value))} type="number" min="0" max="100000" step="0.000001" required className={inputClass} /></label>
          </div>
        </details>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span className="flex items-center gap-2 text-xs text-slate-500"><KeyRound size={15} />Only administrators can change this connection.</span>
        <Button type="submit" variant="primary" icon={Save} disabled={busy !== null || (!credential.configured && !apiKey.trim()) || (Boolean(apiKey.trim()) && !modelsLoaded)}>
          {busy === "save" ? "Saving…" : "Save AI setup"}
        </Button>
      </div>
    </form>
  );
}
