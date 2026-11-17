import { describe, it, expect } from 'vitest';
import {
  connectionLabel,
  validateDeviceForm,
  validateEpc,
  isRfidSimulatorEnabled,
  resolveLabelValue,
  SAMPLE_LABEL_DATA,
} from '../hardware-utils';
import { JEWELRY_LABEL_FIELDS } from '@caratflow/shared-types';

describe('connectionLabel', () => {
  it('maps enums to readable labels', () => {
    expect(connectionLabel('USB_HID')).toBe('USB HID');
    expect(connectionLabel('BLUETOOTH')).toBe('Bluetooth');
    expect(connectionLabel('NETWORK_TCP')).toBe('Network (TCP)');
    expect(connectionLabel('SOME_NEW_KIND')).toBe('Some New Kind');
  });
});

describe('validateDeviceForm', () => {
  it('requires name and location', () => {
    const e = validateDeviceForm({ name: ' ', connectionType: 'USB_HID', locationId: '' });
    expect(e.name).toBeTruthy();
    expect(e.locationId).toBeTruthy();
  });
  it('requires COM port for serial and host for network', () => {
    expect(validateDeviceForm({ name: 'a', connectionType: 'USB_SERIAL', locationId: 'x' }).port).toBeTruthy();
    expect(validateDeviceForm({ name: 'a', connectionType: 'NETWORK_TCP', locationId: 'x' }).ipAddress).toBeTruthy();
  });
  it('validates hex vendor/product ids', () => {
    const bad = validateDeviceForm({
      name: 'a',
      connectionType: 'USB_HID',
      locationId: 'x',
      vendorId: 'zz',
      productId: '0x5678',
    });
    expect(bad.vendorId).toBeTruthy();
    expect(bad.productId).toBeUndefined();
    expect(
      validateDeviceForm({ name: 'a', connectionType: 'USB_HID', locationId: 'x', vendorId: '0x1234' }),
    ).toEqual({});
  });
});

describe('validateEpc', () => {
  it('accepts hex EPCs', () => {
    expect(validateEpc('3034257BF7194E4000000001')).toBeNull();
  });
  it('rejects empty, non-hex, odd and short values', () => {
    expect(validateEpc('')).toMatch(/required/);
    expect(validateEpc('XYZ12345')).toMatch(/hexadecimal/);
    expect(validateEpc('ABC')).toMatch(/8 to 64/);
    expect(validateEpc('ABCDEF123')).toMatch(/even/);
  });
});

describe('isRfidSimulatorEnabled', () => {
  it('is on outside production and off in production unless flagged', () => {
    expect(isRfidSimulatorEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(isRfidSimulatorEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(isRfidSimulatorEnabled({ NODE_ENV: 'production', NEXT_PUBLIC_RFID_SIMULATOR: 'true' })).toBe(true);
    expect(isRfidSimulatorEnabled({ NODE_ENV: 'development', NEXT_PUBLIC_RFID_SIMULATOR: 'false' })).toBe(false);
  });
});

describe('resolveLabelValue', () => {
  it('has a sample for every supported placeholder', () => {
    for (const f of JEWELRY_LABEL_FIELDS) expect(SAMPLE_LABEL_DATA[f]).toBeTruthy();
  });
  it('resolves exact and embedded placeholders', () => {
    expect(resolveLabelValue('{{productName}}')).toBe('Gold Ring 22K');
    expect(resolveLabelValue('SKU: {{sku}}')).toBe('SKU: GR-22K-001');
    expect(resolveLabelValue('Wt: {{grossWeight}} / {{netWeight}}')).toBe('Wt: 8.450 g / 8.200 g');
    expect(resolveLabelValue('HUID: {{huid}}')).toMatch(/^HUID: [A-Z0-9]{6}$/);
  });
  it('leaves unknown placeholders untouched', () => {
    expect(resolveLabelValue('{{nope}}')).toBe('{{nope}}');
  });
});

import { serialPickerEmptyMessage } from '../SerialPicker';

describe('serialPickerEmptyMessage', () => {
  it('guides the user when no serials exist at all', () => {
    expect(serialPickerEmptyMessage('')).toMatch(/No serialised items found/);
  });
  it('explains the search scope when a term matches nothing', () => {
    expect(serialPickerEmptyMessage('Ring')).toMatch(/"Ring".*not product names/);
  });
});
