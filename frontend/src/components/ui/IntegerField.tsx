import { useEffect, useState } from "react";
import { clampInteger, normalizeIntegerText } from "../../utils/integerInput";

interface IntegerFieldProps {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max?: number;
  id?: string;
  inputClassName?: string;
  stepperClassName?: string;
  "aria-label"?: string;
  decreaseLabel?: string;
  increaseLabel?: string;
}

/**
 * Shared whole-number input: `inputMode="numeric"` text field (not
 * `type="number"`) so we fully control formatting instead of fighting
 * inconsistent browser number-input behavior — no decimals reachable, no
 * mouse-wheel value changes (text inputs never respond to wheel), no
 * lingering leading zero ("03" collapses to "3" as you type; "030" -> "30").
 * Focusing selects all text so typing over an existing value replaces it
 * instead of inserting into it. A temporary empty string is allowed while
 * editing — the minimum is only enforced on blur, not on every keystroke.
 * The +/- buttons step by exactly 1, using the last *committed* value as
 * their base so a click mid-edit is still well-defined.
 */
export function IntegerField({
  value,
  onChange,
  min,
  max,
  id,
  inputClassName,
  stepperClassName,
  decreaseLabel = "Verringern",
  increaseLabel = "Erhöhen",
  ...aria
}: IntegerFieldProps) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  function commit(n: number) {
    const clamped = clampInteger(n, min, max);
    setText(String(clamped));
    onChange(clamped);
  }

  return (
    <div className="flex items-stretch gap-1.5">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={text}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const normalized = normalizeIntegerText(e.target.value);
          setText(normalized);
          if (normalized !== "") {
            onChange(clampInteger(Number(normalized), min, max));
          }
        }}
        onBlur={() => commit(text === "" ? min : Number(text))}
        className={inputClassName}
        {...aria}
      />
      <button
        type="button"
        aria-label={decreaseLabel}
        onClick={() => commit(value - 1)}
        className={stepperClassName}
      >
        −
      </button>
      <button
        type="button"
        aria-label={increaseLabel}
        onClick={() => commit(value + 1)}
        className={stepperClassName}
      >
        +
      </button>
    </div>
  );
}
