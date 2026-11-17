import { describe, it, expect } from 'vitest';
import { rupeesToPaise, paiseToRupees, validateAmlRuleForm } from '../aml-rule-form';

describe('aml rule form helpers', () => {
  it('converts rupees to paise and back', () => {
    expect(rupeesToPaise('50000')).toBe(5000000);
    expect(rupeesToPaise('1,25,000.50')).toBe(12500050);
    expect(rupeesToPaise('')).toBeNull();
    expect(paiseToRupees(5000000)).toBe('50000');
    expect(paiseToRupees(12550)).toBe('125.50');
  });
  it('rejects blank and negative amounts', () => {
    expect(validateAmlRuleForm({ ruleType: 'HIGH_VALUE_ALERT', maxAmountRupees: '' }).maxAmount).toMatch(/required/);
    expect(validateAmlRuleForm({ ruleType: 'TRANSACTION_AMOUNT_LIMIT', maxAmountRupees: '-5' }).maxAmount).toMatch(/negative/);
    expect(validateAmlRuleForm({ ruleType: 'TRANSACTION_AMOUNT_LIMIT', maxAmountRupees: '0' }).maxAmount).toMatch(/at least/);
    expect(validateAmlRuleForm({ ruleType: 'TRANSACTION_AMOUNT_LIMIT', maxAmountRupees: '50000' })).toEqual({});
  });
  it('validates other rule types and PEP needs nothing', () => {
    expect(validateAmlRuleForm({ ruleType: 'VELOCITY_CHECK' }).velocityThreshold).toBeTruthy();
    expect(Object.keys(validateAmlRuleForm({ ruleType: 'FREQUENCY_LIMIT', maxCount: '0' }))).toEqual(['maxCount', 'period']);
    expect(validateAmlRuleForm({ ruleType: 'COUNTRY_RESTRICTION', restrictedCountries: ' , ' }).restrictedCountries).toBeTruthy();
    expect(validateAmlRuleForm({ ruleType: 'PEP_CHECK' })).toEqual({});
  });
});
