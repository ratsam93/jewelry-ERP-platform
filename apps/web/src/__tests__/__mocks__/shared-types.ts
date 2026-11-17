// Mock for @caratflow/shared-types - provides enums and type stubs

export enum DeviceStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  ERROR = 'ERROR',
  INITIALIZING = 'INITIALIZING',
}

export enum DeviceType {
  RFID_READER = 'RFID_READER',
  BARCODE_SCANNER = 'BARCODE_SCANNER',
  WEIGHING_SCALE = 'WEIGHING_SCALE',
  LABEL_PRINTER = 'LABEL_PRINTER',
  CUSTOMER_DISPLAY = 'CUSTOMER_DISPLAY',
  BIOMETRIC = 'BIOMETRIC',
}

export enum ConnectionType {
  USB_HID = 'USB_HID',
  USB_SERIAL = 'USB_SERIAL',
  BLUETOOTH = 'BLUETOOTH',
  NETWORK_TCP = 'NETWORK_TCP',
  NETWORK_HTTP = 'NETWORK_HTTP',
}

export enum JobPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum InventoryMetalType {
  GOLD = 'GOLD',
  SILVER = 'SILVER',
  PLATINUM = 'PLATINUM',
  PALLADIUM = 'PALLADIUM',
}

export enum ValuationMethod {
  AVG = 'AVG',
  FIFO = 'FIFO',
  LIFO = 'LIFO',
  WEIGHTED_AVG = 'WEIGHTED_AVG',
}

export enum MovementType {
  IN = 'IN',
  OUT = 'OUT',
  TRANSFER = 'TRANSFER',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum TransferStatus {
  DRAFT = 'DRAFT',
  IN_TRANSIT = 'IN_TRANSIT',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum StockTakeStatus {
  DRAFT = 'DRAFT',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum SalePaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  UPI = 'UPI',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CHEQUE = 'CHEQUE',
  STORE_CREDIT = 'STORE_CREDIT',
  GOLD_EXCHANGE = 'GOLD_EXCHANGE',
}

export const JEWELRY_LABEL_FIELDS = [
  'productName', 'sku', 'barcode', 'grossWeight', 'netWeight',
  'purity', 'huid', 'price', 'qrCode',
] as const;

// Type stubs for components that use `import type` (these are erased at runtime)
export type ChartData = any;
export type KpiData = any;
export type ForecastResult = any;
export type SupportedEntity = any;
export type CustomReportFilter = any;
export type CustomReportAggregation = any;
export type AggregationType = string;
export type DashboardWidgetConfig = any;
export type RfidTagLookupResponse = any;
export type BarcodeProductLookup = any;
export type WeightReading = any;
export type WeightCaptureResponse = any;
export type PrintPreviewResponse = any;
export type LabelField = any;
export type CreateLabelTemplate = any;
export type CustomerDisplayMessage = any;
export type BiometricEventResponse = any;
export type RfidStockTakeResult = any;
export type RfidTagData = any;
export type CreateDeviceConfig = any;

// ─── Manufacturing job status machine (mirror of shared-types/manufacturing.ts) ───
export enum MfgJobOrderStatus {
  DRAFT = 'DRAFT',
  PLANNED = 'PLANNED',
  MATERIAL_ISSUED = 'MATERIAL_ISSUED',
  IN_PROGRESS = 'IN_PROGRESS',
  QC_PENDING = 'QC_PENDING',
  QC_PASSED = 'QC_PASSED',
  QC_FAILED = 'QC_FAILED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export const JOB_ORDER_TRANSITIONS: Record<MfgJobOrderStatus, MfgJobOrderStatus[]> = {
  [MfgJobOrderStatus.DRAFT]: [MfgJobOrderStatus.PLANNED, MfgJobOrderStatus.CANCELLED],
  [MfgJobOrderStatus.PLANNED]: [MfgJobOrderStatus.MATERIAL_ISSUED, MfgJobOrderStatus.CANCELLED],
  [MfgJobOrderStatus.MATERIAL_ISSUED]: [MfgJobOrderStatus.IN_PROGRESS, MfgJobOrderStatus.CANCELLED],
  [MfgJobOrderStatus.IN_PROGRESS]: [MfgJobOrderStatus.QC_PENDING, MfgJobOrderStatus.CANCELLED],
  [MfgJobOrderStatus.QC_PENDING]: [MfgJobOrderStatus.QC_PASSED, MfgJobOrderStatus.QC_FAILED],
  [MfgJobOrderStatus.QC_PASSED]: [MfgJobOrderStatus.COMPLETED],
  [MfgJobOrderStatus.QC_FAILED]: [MfgJobOrderStatus.IN_PROGRESS, MfgJobOrderStatus.CANCELLED],
  [MfgJobOrderStatus.COMPLETED]: [],
  [MfgJobOrderStatus.CANCELLED]: [],
};
