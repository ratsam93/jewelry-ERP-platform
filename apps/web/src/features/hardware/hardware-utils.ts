import { DeviceType, ConnectionType } from '@caratflow/shared-types';

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  [DeviceType.RFID_READER]: 'RFID Reader',
  [DeviceType.BARCODE_SCANNER]: 'Barcode Scanner',
  [DeviceType.WEIGHING_SCALE]: 'Weighing Scale',
  [DeviceType.LABEL_PRINTER]: 'Label Printer',
  [DeviceType.CUSTOMER_DISPLAY]: 'Customer Display',
  [DeviceType.BIOMETRIC]: 'Biometric Device',
};

export const CONNECTION_TYPE_LABELS: Record<ConnectionType, string> = {
  [ConnectionType.USB_HID]: 'USB HID',
  [ConnectionType.USB_SERIAL]: 'USB Serial (COM Port)',
  [ConnectionType.BLUETOOTH]: 'Bluetooth',
  [ConnectionType.NETWORK_TCP]: 'Network (TCP)',
  [ConnectionType.NETWORK_HTTP]: 'Network (HTTP)',
};

function humanize(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Human label for a connection enum; falls back to a humanized value for unknown codes. */
export function connectionLabel(value: string | null | undefined): string {
  if (!value) return '-';
  return CONNECTION_TYPE_LABELS[value as ConnectionType] ?? humanize(value);
}

export function deviceTypeLabel(value: string | null | undefined): string {
  if (!value) return '-';
  return DEVICE_TYPE_LABELS[value as DeviceType] ?? humanize(value);
}

// ─── Device form validation ─────────────────────────────────────

export interface DeviceFormValues {
  name: string;
  connectionType: string;
  locationId: string;
  port?: string;
  ipAddress?: string;
  tcpPort?: number;
  vendorId?: string;
  productId?: string;
}

const USB_ID = /^(0x)?[0-9a-f]{1,4}$/i;
const HOST = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

export function validateDeviceForm(v: DeviceFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!v.name.trim()) errors.name = 'Device name is required.';
  else if (v.name.length > 200) errors.name = 'Device name must be 200 characters or fewer.';
  if (!v.locationId) errors.locationId = 'Select the location this device belongs to.';
  if (v.connectionType === ConnectionType.USB_SERIAL && !v.port?.trim()) {
    errors.port = 'COM port is required for serial devices (e.g. COM3).';
  }
  if (v.connectionType === ConnectionType.NETWORK_TCP || v.connectionType === ConnectionType.NETWORK_HTTP) {
    if (!v.ipAddress?.trim()) errors.ipAddress = 'IP address or host is required for network devices.';
    else if (!HOST.test(v.ipAddress.trim())) errors.ipAddress = 'Enter a valid IP address or host name.';
    if (v.tcpPort !== undefined && v.tcpPort !== 0 && (v.tcpPort < 1 || v.tcpPort > 65535)) {
      errors.tcpPort = 'TCP port must be between 1 and 65535.';
    }
  }
  if (v.connectionType === ConnectionType.USB_HID) {
    if (v.vendorId && !USB_ID.test(v.vendorId.trim())) {
      errors.vendorId = 'Vendor ID must be hexadecimal, e.g. 0x1234.';
    }
    if (v.productId && !USB_ID.test(v.productId.trim())) {
      errors.productId = 'Product ID must be hexadecimal, e.g. 0x5678.';
    }
  }
  return errors;
}

// ─── RFID ───────────────────────────────────────────────────────

/** EPC is a hexadecimal string, whole bytes (8 to 64 hex characters). */
export function validateEpc(value: string): string | null {
  const v = value.trim();
  if (!v) return 'EPC is required.';
  if (!/^[0-9a-f]+$/i.test(v)) return 'EPC must contain only hexadecimal characters (0-9, A-F).';
  if (v.length < 8 || v.length > 64) return 'EPC must be 8 to 64 hex characters (typically 24).';
  if (v.length % 2 !== 0) return 'EPC must have an even number of hex characters.';
  return null;
}

/** The test tag simulator is a dev aid: hidden in production unless explicitly enabled. */
export function isRfidSimulatorEnabled(
  env: { NODE_ENV?: string; NEXT_PUBLIC_RFID_SIMULATOR?: string } = {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_RFID_SIMULATOR: process.env.NEXT_PUBLIC_RFID_SIMULATOR,
  },
): boolean {
  const flag = (env.NEXT_PUBLIC_RFID_SIMULATOR ?? '').toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  return env.NODE_ENV !== 'production';
}

// ─── Label placeholders ─────────────────────────────────────────

/** Sample values for every supported placeholder (see JEWELRY_LABEL_FIELDS). */
export const SAMPLE_LABEL_DATA: Record<string, string> = {
  sku: 'GR-22K-001',
  productName: 'Gold Ring 22K',
  grossWeight: '8.450 g',
  netWeight: '8.200 g',
  purity: '22K (916)',
  huid: 'AB12CD',
  price: '₹45,000',
  barcode: 'GR22K001',
  qrCode: '{"sku":"GR-22K-001","huid":"AB12CD"}',
};

/** Replace every {{placeholder}} inside `value`, including inside mixed text like "SKU: {{sku}}". */
export function resolveLabelValue(
  value: string,
  data: Record<string, string> = SAMPLE_LABEL_DATA,
): string {
  return value.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(data, key) ? (data[key] as string) : match,
  );
}
