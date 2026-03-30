import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useFinancingRates } from "@/hooks/useFinancingRates";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import type { FormaPagamento, BoletoRateData } from "@/lib/financing";

function getNearestAvailableInstallment(target: number, options: number[]) {
  if (!options.length) return 1;
  if (options.includes(target)) return target;
  return options.reduce((closest, current) =>
    Math.abs(current - target) < Math.abs(closest - target) ? current : closest, options[0]);
}

function getAvailableCarenciaValues(rates: Array<{ coeficiente_60?: any; coeficiente_90?: any }>): Array<30 | 60 | 90> {
  const values: Array<30 | 60 | 90> = [30];
  if (rates.some((r) => Number(r.coeficiente_60) > 0)) values.push(60);
  if (rates.some((r) => Number(r.coeficiente_90) > 0)) values.push(90);
  return values;
}

const CARENCIA_OPTIONS: { value: "30" | "60" | "90"; label: string }[] = [
  { value: "30", label: "30 dias" },
  { value: "60", label: "60 dias" },
  { value: "90", label: "90 dias" },
];

interface UseSimulatorRatesParams {
  formaPagamento: FormaPagamento;
  parcelas: number;
  setParcelas: (v: number) => void;
  carenciaDias: 30 | 60 | 90;
  setCarenciaDias: (v: 30 | 60 | 90) => void;
  storedParcelas?: number;
  storedCarencia?: number;
}

export function useSimulatorRates({
  formaPagamento, parcelas, setParcelas, carenciaDias, setCarenciaDias,
  storedParcelas, storedCarencia,
}: UseSimulatorRatesParams) {
  const { settings } = useCompanySettings();
  const { rates: boletoRates, activeProviders: boletoProviders } = useFinancingRates("boleto");
  const { rates: creditoRates, activeProviders: creditoProviders } = useFinancingRates("credito");
  const boletoDefaults = ((settings as any)?.boleto_defaults || {}) as Record<string, { parcelas: number; carencia: number }>;
  const creditoDefaults = ((settings as any)?.credito_defaults || {}) as Record<string, { parcelas: number }>;

  const [selectedBoletoProvider, setSelectedBoletoProvider] = useState("");
  const [selectedCreditoProvider, setSelectedCreditoProvider] = useState("");

  const currentBoletoRates = useMemo(() => boletoRates.filter((r) => r.provider_name === selectedBoletoProvider), [boletoRates, selectedBoletoProvider]);
  const currentCreditoRates = useMemo(() => creditoRates.filter((r) => r.provider_name === selectedCreditoProvider), [creditoRates, selectedCreditoProvider]);

  const availableBoletoInstallments = useMemo(() => [...new Set(currentBoletoRates.map((r) => Number(r.installments)).filter((n) => n > 0))].sort((a, b) => a - b), [currentBoletoRates]);
  const availableCreditoInstallments = useMemo(() => [...new Set(currentCreditoRates.map((r) => Number(r.installments)).filter((n) => n > 0))].sort((a, b) => a - b), [currentCreditoRates]);

  const availableParcelas = useMemo(() => {
    if (formaPagamento === "Boleto") return availableBoletoInstallments;
    if (formaPagamento === "Credito" || formaPagamento === "Credito / Boleto") return availableCreditoInstallments;
    return [1];
  }, [formaPagamento, availableBoletoInstallments, availableCreditoInstallments]);

  const maxParcelas = useMemo(() => availableParcelas.length > 0 ? Math.max(...availableParcelas) : 1, [availableParcelas]);

  const availableCarenciaOptions = useMemo(() => {
    const allowed = new Set(getAvailableCarenciaValues(currentBoletoRates));
    return CARENCIA_OPTIONS.filter((c) => allowed.has(Number(c.value) as 30 | 60 | 90));
  }, [currentBoletoRates]);

  const showParcelas = ["Credito", "Boleto", "Credito / Boleto"].includes(formaPagamento);
  const showPlus = ["A vista", "Pix"].includes(formaPagamento);
  const showCarencia = ["Boleto", "Credito / Boleto"].includes(formaPagamento);

  // Provider defaults
  const applyBoletoDefaults = useCallback((provider: string) => {
    const providerRates = boletoRates.filter((r) => r.provider_name === provider);
    const providerInstallments = [...new Set(providerRates.map((r) => Number(r.installments)).filter((n) => n > 0))].sort((a, b) => a - b);
    const providerCarencias = getAvailableCarenciaValues(providerRates);
    const pd = boletoDefaults[provider];
    if (pd?.parcelas > 0) setParcelas(getNearestAvailableInstallment(pd.parcelas, providerInstallments));
    else if (providerInstallments.length > 0) setParcelas(providerInstallments[0]);
    if (pd && providerCarencias.includes(pd.carencia as 30 | 60 | 90)) setCarenciaDias(pd.carencia as 30 | 60 | 90);
    else setCarenciaDias(providerCarencias[0] ?? 30);
  }, [boletoRates, boletoDefaults, setParcelas, setCarenciaDias]);

  const applyCreditoDefaults = useCallback((provider: string) => {
    const providerRates = creditoRates.filter((r) => r.provider_name === provider);
    const providerInstallments = [...new Set(providerRates.map((r) => Number(r.installments)).filter((n) => n > 0))].sort((a, b) => a - b);
    const pd = creditoDefaults[provider];
    if (pd?.parcelas > 0) setParcelas(getNearestAvailableInstallment(pd.parcelas, providerInstallments));
    else if (providerInstallments.length > 0) setParcelas(providerInstallments[0]);
  }, [creditoRates, creditoDefaults, setParcelas]);

  // Auto-select first provider
  useEffect(() => { if (boletoProviders.length > 0 && !selectedBoletoProvider) setSelectedBoletoProvider(boletoProviders[0]); }, [boletoProviders, selectedBoletoProvider]);
  useEffect(() => { if (creditoProviders.length > 0 && !selectedCreditoProvider) setSelectedCreditoProvider(creditoProviders[0]); }, [creditoProviders, selectedCreditoProvider]);

  // Apply defaults once
  const boletoDefaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (boletoDefaultsAppliedRef.current || !selectedBoletoProvider || storedParcelas || storedCarencia) return;
    applyBoletoDefaults(selectedBoletoProvider);
    boletoDefaultsAppliedRef.current = true;
  }, [selectedBoletoProvider, applyBoletoDefaults, storedParcelas, storedCarencia]);

  const creditoDefaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (creditoDefaultsAppliedRef.current || !selectedCreditoProvider || storedParcelas) return;
    if (formaPagamento === "Credito" || formaPagamento === "Credito / Boleto") {
      applyCreditoDefaults(selectedCreditoProvider);
      creditoDefaultsAppliedRef.current = true;
    }
  }, [selectedCreditoProvider, applyCreditoDefaults, formaPagamento, storedParcelas]);

  // Sync parcelas
  useEffect(() => {
    if (!showParcelas || availableParcelas.length === 0) return;
    const next = getNearestAvailableInstallment(parcelas, availableParcelas);
    if (next !== parcelas) setParcelas(next);
  }, [showParcelas, availableParcelas, parcelas, setParcelas]);

  // Sync carencia
  useEffect(() => {
    if (!showCarencia || availableCarenciaOptions.length === 0) return;
    if (!availableCarenciaOptions.some((o) => Number(o.value) === carenciaDias))
      setCarenciaDias(Number(availableCarenciaOptions[0].value) as 30 | 60 | 90);
  }, [showCarencia, availableCarenciaOptions, carenciaDias, setCarenciaDias]);

  // Coefficients
  const { boletoCoeffMap, boletoRatesFullMap } = useMemo(() => {
    const coeffMap: Record<number, number> = {};
    const fullMap: Record<number, BoletoRateData> = {};
    currentBoletoRates.forEach((r) => {
      coeffMap[r.installments] = Number(r.coefficient);
      fullMap[r.installments] = { coefficient: Number(r.coefficient), taxa_fixa: Number(r.taxa_fixa), coeficiente_60: Number(r.coeficiente_60), coeficiente_90: Number(r.coeficiente_90) };
    });
    return { boletoCoeffMap: coeffMap, boletoRatesFullMap: fullMap };
  }, [currentBoletoRates]);

  const { creditoCoeffMap, creditoRatesFullMap } = useMemo(() => {
    const coeffMap: Record<number, number> = {};
    const fullMap: Record<number, { coefficient: number; taxa_fixa: number }> = {};
    currentCreditoRates.forEach((r) => {
      coeffMap[r.installments] = Number(r.coefficient);
      fullMap[r.installments] = { coefficient: Number(r.coefficient), taxa_fixa: Number(r.taxa_fixa) };
    });
    return { creditoCoeffMap: coeffMap, creditoRatesFullMap: fullMap };
  }, [currentCreditoRates]);

  return {
    settings,
    boletoProviders, creditoProviders,
    selectedBoletoProvider, selectedCreditoProvider,
    setSelectedBoletoProvider, setSelectedCreditoProvider,
    applyBoletoDefaults, applyCreditoDefaults,
    availableParcelas, maxParcelas,
    availableBoletoInstallments, availableCreditoInstallments,
    availableCarenciaOptions,
    showParcelas, showPlus, showCarencia,
    boletoCoeffMap, boletoRatesFullMap,
    creditoCoeffMap, creditoRatesFullMap,
  };
}
