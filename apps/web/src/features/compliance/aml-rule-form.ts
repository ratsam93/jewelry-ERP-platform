/** Pure helpers for the AML rule form (rupee input <-> paise storage + validation). */

export type AmlRuleType =
  | 'TRANSACTION_AMOUNT_LIMIT'
  | 'FREQUENCY_LIMIT'
  | 'VELOCITY_CHECK'
  | 'HIGH_VALUE_ALERT'
  | 'COUNTRY_RESTRICTION'
  | 'PEP_CHECK';

/** "50000" or "50,000.50" rupees -> paise integer; null when blank/invalid. */
export function rupeesToPaise(input: string | undefined): number | null {
  const raw = (input ?? '').replace(/,/g, '').trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** paise -> rupee string for an input box ("5000000" -> "50000"). */
export function paiseToRupees(paise: number | undefined | null): string {
  if (paise === undefined || paise === null || !Number.isFinite(paise)) return '';
  const r = paise / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

export interface AmlFormValues {
  ruleType: AmlRuleType;
  /** Rupees as typed by the user. */
  maxAmountRupees?: string;
  velocityThresholdRupees?: string;
  maxCount?: string;
  period?: string;
  restrictedCountries?: string;
}

export type AmlFormErrors = Partial<Record<'maxAmount' | 'velocityThreshold' | 'maxCount' | 'period' | 'restrictedCountries', string>>;

function checkAmount(v: string | undefined, label: string): string | undefined {
  if (!v || !v.trim()) return `${label} is required.`;
  const paise = rupeesToPaise(v);
  if (paise === null) return `${label} must be a number.`;
  if (paise < 0) return `${label} cannot be negative.`;
  if (paise < 1) return `${label} must be at least ₹0.01.`;
  return undefined;
}

export function validateAmlRuleForm(f: AmlFormValues): AmlFormErrors {
  const e: AmlFormErrors = {};
  switch (f.ruleType) {
    case 'TRANSACTION_AMOUNT_LIMIT':
    case 'HIGH_VALUE_ALERT': {
      const m = checkAmount(f.maxAmountRupees, 'Max amount');
      if (m) e.maxAmount = m;
      break;
    }
    case 'VELOCITY_CHECK': {
      const m = checkAmount(f.velocityThresholdRupees, 'Velocity threshold');
      if (m) e.velocityThreshold = m;
      break;
    }
    case 'FREQUENCY_LIMIT': {
      const raw = (f.maxCount ?? '').trim();
      const n = Number(raw);
      if (!raw) e.maxCount = 'Max count is required.';
      else if (!Number.isFinite(n) || n < 1) e.maxCount = 'Max count must be at least 1.';
      if (!(f.period ?? '').trim()) e.period = 'Period is required (e.g. 24h, 7d).';
      break;
    }
    case 'COUNTRY_RESTRICTION':
      if (!(f.restrictedCountries ?? '').split(',').some((c) => c.trim())) {
        e.restrictedCountries = 'Enter at least one country code.';
      }
      break;
    default:
      break;
  }
  return e;
}
