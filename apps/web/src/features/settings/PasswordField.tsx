'use client';

import { useId, useState } from 'react';
import { Eye, EyeOff, Wand2 } from 'lucide-react';
import { generateStrongPassword, passwordStrength, PASSWORD_HINT } from './password-tools';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  confirmLabel?: string;
  confirmValue: string;
  onConfirmChange: (value: string) => void;
  error?: string;
  confirmError?: string;
  /** When a password is generated it is also copied into the confirm field. */
  onGenerated?: (value: string) => void;
}

const STRENGTH_LABEL = { empty: '', weak: 'Weak', fair: 'Almost there', strong: 'Strong' } as const;
const STRENGTH_COLOR = { empty: '', weak: 'text-red-600', fair: 'text-amber-600', strong: 'text-green-600' } as const;

/** Password + confirm with show/hide, strength hint and a "Generate strong password" button. */
export function PasswordField({
  label,
  value,
  onChange,
  confirmLabel = 'Confirm password',
  confirmValue,
  onConfirmChange,
  error,
  confirmError,
  onGenerated,
}: Props) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const strength = passwordStrength(value);

  const generate = () => {
    const pw = generateStrongPassword(16);
    onChange(pw);
    onConfirmChange(pw);
    setVisible(true);
    onGenerated?.(pw);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium" htmlFor={`${id}-pw`}>{label}</label>
          <button
            type="button"
            onClick={generate}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
            Generate strong password
          </button>
        </div>
        <div className="relative mt-1">
          <input
            id={`${id}-pw`}
            type={visible ? 'text' : 'password'}
            autoComplete="new-password"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-hint`}
            className="w-full rounded-md border px-3 py-2 pr-10 font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">
          {PASSWORD_HINT}{' '}
          {strength !== 'empty' && (
            <span className={`font-medium ${STRENGTH_COLOR[strength]}`} aria-live="polite">
              {STRENGTH_LABEL[strength]}
            </span>
          )}
        </p>
        {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium" htmlFor={`${id}-confirm`}>{confirmLabel}</label>
        <input
          id={`${id}-confirm`}
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirmValue}
          onChange={(e) => onConfirmChange(e.target.value)}
          aria-invalid={confirmError ? true : undefined}
          className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-sm"
        />
        {confirmError && <p role="alert" className="mt-1 text-xs text-red-600">{confirmError}</p>}
      </div>
    </div>
  );
}
