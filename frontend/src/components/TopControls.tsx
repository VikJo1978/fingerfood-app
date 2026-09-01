import { useEffect, useState } from "react";
import type { BudgetBasis, BudgetScope, BudgetType } from "../types";
import { normalizeIntegerText } from "../utils/integerInput";
import { formatCurrency } from "../utils/pricing";
import { IntegerField } from "./ui/IntegerField";

interface TopControlsProps {
  persons: number;
  onPersonsChange: (n: number) => void;
  budgetEnabled: boolean;
  onBudgetEnabledChange: (v: boolean) => void;
  totalBudget: number;
  onTotalBudgetChange: (n: number) => void;
  budgetType: BudgetType;
  onBudgetTypeChange: (v: BudgetType) => void;
  budgetBasis: BudgetBasis;
  onBudgetBasisChange: (v: BudgetBasis) => void;
  budgetScope: BudgetScope;
  onBudgetScopeChange: (v: BudgetScope) => void;
}

const selectClass =
  "rounded-control border border-line bg-white px-2.5 py-2 text-sm text-ink transition focus:border-accent";
const fieldLabelClass = "text-[11px] font-extrabold uppercase tracking-[.05em] text-muted";

function BudgetAmountInput({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  const [text, setText] = useState(String(Math.max(0, Math.round(value))));

  useEffect(() => {
    setText(String(Math.max(0, Math.round(value))));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label={label}
      value={text}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        const normalized = normalizeIntegerText(event.target.value);
        setText(normalized);
        if (normalized !== "") {
          onChange(Math.max(0, Number(normalized)));
        }
      }}
      onBlur={() => {
        const committed = text === "" ? 0 : Math.max(0, Number(text));
        setText(String(committed));
        onChange(committed);
      }}
      className="w-full min-w-[9rem] rounded-control border border-line bg-canvas/60 px-3 py-2.5 text-ink transition focus:border-accent focus:bg-white sm:w-36"
    />
  );
}

export function TopControls({
  persons,
  onPersonsChange,
  budgetEnabled,
  onBudgetEnabledChange,
  totalBudget,
  onTotalBudgetChange,
  budgetType,
  onBudgetTypeChange,
  budgetBasis,
  onBudgetBasisChange,
  budgetScope,
  onBudgetScopeChange,
}: TopControlsProps) {
  // Inverse of whatever the operator configured — a per-person rate shown
  // as its absolute total, or an absolute total shown as its per-person
  // rate — purely informational, doesn't affect budgetType itself.
  const convertedAmount =
    budgetType === "per_person" ? totalBudget * persons : persons > 0 ? totalBudget / persons : 0;

  return (
    <div className="flex flex-col gap-4 rounded-card border border-line bg-white p-5 shadow-card sm:flex-row sm:flex-wrap sm:items-end sm:gap-6">
      <label className="flex flex-col gap-1.5">
        <span className={fieldLabelClass}>Anzahl Personen</span>
        <IntegerField
          value={persons}
          onChange={onPersonsChange}
          min={0}
          max={5000}
          aria-label="Anzahl Personen"
          inputClassName="w-full min-w-[6rem] rounded-control border border-line bg-canvas/60 px-3 py-2.5 text-ink transition focus:border-accent focus:bg-white sm:w-28"
          stepperClassName="flex w-9 items-center justify-center rounded-control border border-line bg-white text-ink transition hover:border-accent hover:bg-accent-soft"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className={fieldLabelClass}>Budget</span>
        <button
          type="button"
          onClick={() => onBudgetEnabledChange(!budgetEnabled)}
          className={`inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition ${
            budgetEnabled
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-white text-ink hover:border-accent hover:bg-accent-soft"
          }`}
          aria-pressed={budgetEnabled}
        >
          <span
            className={`relative inline-flex h-5 w-9 rounded-full transition ${
              budgetEnabled ? "bg-accent" : "bg-line"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                budgetEnabled ? "left-4" : "left-0.5"
              }`}
            />
          </span>
          Mit Budget arbeiten
        </button>
      </div>

      {budgetEnabled ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>
              {budgetType === "per_person" ? "Budget pro Person" : "Gesamtbudget"}
            </span>
            <BudgetAmountInput
              value={totalBudget}
              onChange={onTotalBudgetChange}
              label={budgetType === "per_person" ? "Budget pro Person" : "Gesamtbudget"}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Budget-Typ</span>
            <select
              value={budgetType}
              onChange={(e) => onBudgetTypeChange(e.target.value as BudgetType)}
              className={selectClass}
            >
              <option value="total">Gesamt</option>
              <option value="per_person">Pro Person</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Basis</span>
            <select
              value={budgetBasis}
              onChange={(e) => onBudgetBasisChange(e.target.value as BudgetBasis)}
              className={selectClass}
            >
              <option value="gross">Brutto</option>
              <option value="net">Netto</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Umfang</span>
            <select
              value={budgetScope}
              onChange={(e) => onBudgetScopeChange(e.target.value as BudgetScope)}
              className={selectClass}
            >
              <option value="full_offer">Gesamtes Angebot</option>
              <option value="positions_only">Nur Positionen</option>
            </select>
          </label>

          <div className="flex flex-col gap-1 rounded-control border border-line bg-canvas px-4 py-3 sm:min-w-[11rem]">
            <span className={fieldLabelClass}>
              {budgetType === "per_person" ? "Budget gesamt" : "Budget pro Person"}
            </span>
            <span className="text-lg font-bold text-ink">{formatCurrency(convertedAmount)}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
