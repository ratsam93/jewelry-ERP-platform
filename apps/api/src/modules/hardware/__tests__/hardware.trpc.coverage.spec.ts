import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrpcService } from '../../../trpc/trpc.service';
import { HardwareTrpcRouter } from '../hardware.trpc';

describe('HardwareTrpcRouter (procedure coverage)', () => {
  const trpc = new TrpcService();

  const deviceService = {
    listDevices: vi.fn(),
    registerDevice: vi.fn(),
    updateDevice: vi.fn(),
    removeDevice: vi.fn(),
    getDeviceStatus: vi.fn(),
    getDevice: vi.fn(),
  };
  const rfidService = {
    readTags: vi.fn(),
    processScans: vi.fn(),
    lookupTag: vi.fn(),
    stockTake: vi.fn(),
    writeTag: vi.fn(),
    antiTheftCheck: vi.fn(),
  };
  const barcodeService = {
    lookup: vi.fn(),
    generate: vi.fn(),
    generateBulk: vi.fn(),
  };
  const scaleService = {
    getLastReading: vi.fn(),
    captureWeight: vi.fn(),
    setTare: vi.fn(),
    clearTare: vi.fn(),
    calculateWeightPrice: vi.fn(),
    checkTolerance: vi.fn(),
    processReading: vi.fn(),
  };
  const printerService = {
    listTemplates: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    getTemplate: vi.fn(),
    generatePrintData: vi.fn(),
    generateBulkPrintData: vi.fn(),
    preview: vi.fn(),
    generateJewelryLabel: vi.fn(),
  };
  const displayService = {
    sendMessage: vi.fn(),
    clearDisplay: vi.fn(),
  };
  const biometricService = {
    processEvent: vi.fn(),
    getAttendance: vi.fn(),
    getAttendanceSummary: vi.fn(),
  };

  const ctx = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    userRole: 'store-manager',
    userPermissions: ['*'],
  };

  const routerInstance = new HardwareTrpcRouter(
    trpc,
    deviceService as never,
    rfidService as never,
    barcodeService as never,
    scaleService as never,
    printerService as never,
    displayService as never,
    biometricService as never,
  );
  const caller = routerInstance.router.createCaller(ctx);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Valid RFC 9562 v4 UUIDs (Zod 4 strictly validates version and variant digits)
  const DEVICE_ID = '3f1e2d4c-5b6a-4789-9abc-def012345678';
  const DEVICE_ID_2 = '3f1e2d4c-5b6a-4789-9abc-def012345679';
  const LOCATION_ID = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
  const SERIAL_ID = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
  const TEMPLATE_ID = '1c2d3e4f-5a6b-4c7d-9e8f-0a1b2c3d4e5f';
  const PRODUCT_ID = '2d3e4f5a-6b7c-4d8e-8f9a-1b2c3d4e5f6a';
  const PRODUCT_ID_2 = '3e4f5a6b-7c8d-4e9f-9a0b-2c3d4e5f6a7b';
  const PRINTER_ID = '4f5a6b7c-8d9e-4f0a-8b1c-3d4e5f6a7b8c';

  const timestamp = '2026-11-01T10:00:00.000Z';

  const deviceConfig = {
    name: 'Front scale',
    deviceType: 'WEIGHING_SCALE' as const,
    connectionType: 'USB_SERIAL' as const,
    port: 'COM3',
    baudRate: 9600,
    locationId: LOCATION_ID,
  };

  // ─── Devices ───────────────────────────────────────────
  describe('devices.list', () => {
    it('forwards filters with pagination defaults', async () => {
      deviceService.listDevices.mockResolvedValue({ items: [] });
      const result = await caller.devices.list({ locationId: LOCATION_ID, deviceType: 'BARCODE_SCANNER' });
      expect(deviceService.listDevices).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ page: 1, limit: 20, locationId: LOCATION_ID, deviceType: 'BARCODE_SCANNER' }),
      );
      expect(result).toEqual({ items: [] });
    });

    it('rejects an unknown device type', async () => {
      await expect(caller.devices.list({ deviceType: 'TOASTER' as never })).rejects.toThrow();
    });
  });

  describe('devices.register', () => {
    it('registers the device with defaults applied', async () => {
      deviceService.registerDevice.mockResolvedValue({ id: DEVICE_ID });
      const result = await caller.devices.register(deviceConfig);
      expect(deviceService.registerDevice).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ name: 'Front scale', port: 'COM3', isActive: true, settings: {} }),
      );
      expect(result).toEqual({ id: DEVICE_ID });
    });

    it('rejects a TCP port outside 1-65535', async () => {
      await expect(
        caller.devices.register({ ...deviceConfig, tcpPort: 70000 }),
      ).rejects.toThrow();
    });
  });

  describe('devices.update', () => {
    it('updates the device with partial data', async () => {
      deviceService.updateDevice.mockResolvedValue({ id: DEVICE_ID });
      const result = await caller.devices.update({ deviceId: DEVICE_ID, data: { name: 'Scale 2' } });
      expect(deviceService.updateDevice).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        DEVICE_ID,
        expect.objectContaining({ name: 'Scale 2' }),
      );
      expect(result).toEqual({ id: DEVICE_ID });
    });

    it('rejects a non-uuid device id', async () => {
      await expect(caller.devices.update({ deviceId: 'bad', data: { name: 'x' } })).rejects.toThrow();
    });
  });

  describe('devices.remove', () => {
    it('removes the device', async () => {
      deviceService.removeDevice.mockResolvedValue({ success: true });
      const result = await caller.devices.remove({ deviceId: DEVICE_ID });
      expect(deviceService.removeDevice).toHaveBeenCalledWith('tenant-1', DEVICE_ID);
      expect(result).toEqual({ success: true });
    });
  });

  describe('devices.getStatus', () => {
    it('returns the device status', async () => {
      deviceService.getDeviceStatus.mockResolvedValue({ status: 'CONNECTED' });
      const result = await caller.devices.getStatus({ deviceId: DEVICE_ID });
      expect(deviceService.getDeviceStatus).toHaveBeenCalledWith('tenant-1', DEVICE_ID);
      expect(result).toEqual({ status: 'CONNECTED' });
    });
  });

  describe('devices.getById', () => {
    it('returns the device', async () => {
      deviceService.getDevice.mockResolvedValue({ id: DEVICE_ID });
      const result = await caller.devices.getById({ deviceId: DEVICE_ID });
      expect(deviceService.getDevice).toHaveBeenCalledWith('tenant-1', DEVICE_ID);
      expect(result).toEqual({ id: DEVICE_ID });
    });
  });

  // ─── RFID ──────────────────────────────────────────────
  describe('rfid.read', () => {
    it('reads tags from the default reader when no input is given', async () => {
      rfidService.readTags.mockResolvedValue({ tags: [] });
      const result = await caller.rfid.read();
      expect(rfidService.readTags).toHaveBeenCalledWith('tenant-1', undefined);
      expect(result).toEqual({ tags: [] });
    });

    it('passes the requested reader id', async () => {
      rfidService.readTags.mockResolvedValue({ tags: [] });
      await caller.rfid.read({ readerId: 'RDR-1' });
      expect(rfidService.readTags).toHaveBeenCalledWith('tenant-1', 'RDR-1');
    });

    it('rejects an empty reader id', async () => {
      await expect(caller.rfid.read({ readerId: '' })).rejects.toThrow();
    });
  });

  describe('rfid.processScans', () => {
    it('processes the scan batch', async () => {
      rfidService.processScans.mockResolvedValue({ processed: 1 });
      const input = {
        tags: [{ tagId: 'T-1', epc: 'E200-1', timestamp }],
        readerDeviceId: DEVICE_ID,
      };
      const result = await caller.rfid.processScans(input);
      expect(rfidService.processScans).toHaveBeenCalledWith('tenant-1', input);
      expect(result).toEqual({ processed: 1 });
    });

    it('rejects a scan with a non-uuid reader', async () => {
      await expect(
        caller.rfid.processScans({ tags: [], readerDeviceId: 'bad' }),
      ).rejects.toThrow();
    });
  });

  describe('rfid.lookupTag', () => {
    it('looks up the tag by EPC', async () => {
      rfidService.lookupTag.mockResolvedValue({ epc: 'E200-1' });
      const result = await caller.rfid.lookupTag({ epc: 'E200-1' });
      expect(rfidService.lookupTag).toHaveBeenCalledWith('tenant-1', 'E200-1');
      expect(result).toEqual({ epc: 'E200-1' });
    });

    it('rejects an empty EPC', async () => {
      await expect(caller.rfid.lookupTag({ epc: '' })).rejects.toThrow();
    });
  });

  describe('rfid.stockTake', () => {
    it('runs a stock take for the location', async () => {
      rfidService.stockTake.mockResolvedValue({ totalScanned: 0 });
      const input = { locationId: LOCATION_ID, scannedTags: [] };
      const result = await caller.rfid.stockTake(input);
      expect(rfidService.stockTake).toHaveBeenCalledWith('tenant-1', input);
      expect(result).toEqual({ totalScanned: 0 });
    });
  });

  describe('rfid.writeTag', () => {
    it('writes data to the serial number tag', async () => {
      rfidService.writeTag.mockResolvedValue({ success: true });
      const result = await caller.rfid.writeTag({
        serialNumberId: SERIAL_ID,
        data: { tagId: 'T-1', data: 'SKU-100' },
      });
      expect(rfidService.writeTag).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        SERIAL_ID,
        { tagId: 'T-1', data: 'SKU-100' },
      );
      expect(result).toEqual({ success: true });
    });

    it('rejects an empty payload', async () => {
      await expect(
        caller.rfid.writeTag({ serialNumberId: SERIAL_ID, data: { tagId: 'T-1', data: '' } }),
      ).rejects.toThrow();
    });
  });

  describe('rfid.antiTheftCheck', () => {
    it('checks the tag against the location', async () => {
      rfidService.antiTheftCheck.mockResolvedValue({ isAuthorized: true });
      const input = { tagId: 'T-1', epc: 'E200-1', locationId: LOCATION_ID };
      const result = await caller.rfid.antiTheftCheck(input);
      expect(rfidService.antiTheftCheck).toHaveBeenCalledWith('tenant-1', input);
      expect(result).toEqual({ isAuthorized: true });
    });
  });

  // ─── Barcode ───────────────────────────────────────────
  describe('barcode.lookup', () => {
    it('looks up the scanned barcode', async () => {
      barcodeService.lookup.mockResolvedValue({ barcode: '8901', product: null });
      const result = await caller.barcode.lookup({ barcode: '8901' });
      expect(barcodeService.lookup).toHaveBeenCalledWith('tenant-1', '8901');
      expect(result).toEqual({ barcode: '8901', product: null });
    });

    it('rejects an empty barcode', async () => {
      await expect(caller.barcode.lookup({ barcode: '' })).rejects.toThrow();
    });
  });

  describe('barcode.generate', () => {
    it('generates a barcode with the default SKU format', async () => {
      barcodeService.generate.mockResolvedValue({ barcode: 'SKU-1' });
      const result = await caller.barcode.generate({ productId: PRODUCT_ID });
      expect(barcodeService.generate).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ productId: PRODUCT_ID, format: 'SKU' }),
      );
      expect(result).toEqual({ barcode: 'SKU-1' });
    });
  });

  describe('barcode.generateBulk', () => {
    it('generates barcodes for multiple products', async () => {
      barcodeService.generateBulk.mockResolvedValue({ count: 2 });
      const input = {
        productIds: [PRODUCT_ID, PRODUCT_ID_2],
        format: 'CUSTOM' as const,
        customPrefix: 'JW',
      };
      const result = await caller.barcode.generateBulk(input);
      expect(barcodeService.generateBulk).toHaveBeenCalledWith('tenant-1', input);
      expect(result).toEqual({ count: 2 });
    });

    it('rejects an empty product list', async () => {
      await expect(caller.barcode.generateBulk({ productIds: [] })).rejects.toThrow();
    });
  });

  // ─── Scale ─────────────────────────────────────────────
  describe('scale.getReading', () => {
    it('returns the last reading for the device', async () => {
      scaleService.getLastReading.mockResolvedValue({ weightMg: 10500 });
      const result = await caller.scale.getReading({ deviceId: DEVICE_ID });
      expect(scaleService.getLastReading).toHaveBeenCalledWith('tenant-1', DEVICE_ID);
      expect(result).toEqual({ weightMg: 10500 });
    });
  });

  describe('scale.captureWeight', () => {
    it('captures the weight with tare defaulting to zero', async () => {
      scaleService.captureWeight.mockResolvedValue({ netWeightMg: 10500 });
      const result = await caller.scale.captureWeight({ deviceId: DEVICE_ID });
      expect(scaleService.captureWeight).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ deviceId: DEVICE_ID, tareWeightMg: 0 }),
      );
      expect(result).toEqual({ netWeightMg: 10500 });
    });

    it('rejects a negative tare weight', async () => {
      await expect(
        caller.scale.captureWeight({ deviceId: DEVICE_ID, tareWeightMg: -1 }),
      ).rejects.toThrow();
    });
  });

  describe('scale.tare', () => {
    it('stores the tare and reports success', async () => {
      const result = await caller.scale.tare({ deviceId: DEVICE_ID, tareWeightMg: 500 });
      expect(scaleService.setTare).toHaveBeenCalledWith('tenant-1', DEVICE_ID, 500);
      expect(result).toEqual({ success: true, tareWeightMg: 500 });
    });

    it('rejects a negative tare', async () => {
      await expect(caller.scale.tare({ deviceId: DEVICE_ID, tareWeightMg: -5 })).rejects.toThrow();
    });
  });

  describe('scale.clearTare', () => {
    it('clears the tare and reports success', async () => {
      const result = await caller.scale.clearTare({ deviceId: DEVICE_ID });
      expect(scaleService.clearTare).toHaveBeenCalledWith('tenant-1', DEVICE_ID);
      expect(result).toEqual({ success: true });
    });
  });

  describe('scale.calculatePrice', () => {
    it('prices the weight from metal rate and purity', async () => {
      scaleService.calculateWeightPrice.mockReturnValue({ metalValuePaise: 700000 });
      const input = { weightMg: 10000, metalRatePaisePerGram: 7000, purityFineness: 916 };
      const result = await caller.scale.calculatePrice(input);
      expect(scaleService.calculateWeightPrice).toHaveBeenCalledWith(input);
      expect(result).toEqual({ metalValuePaise: 700000 });
    });

    it('rejects purity above 999', async () => {
      await expect(
        caller.scale.calculatePrice({ weightMg: 1, metalRatePaisePerGram: 1, purityFineness: 1000 }),
      ).rejects.toThrow();
    });
  });

  describe('scale.checkTolerance', () => {
    it('checks weight tolerance with the default percent', async () => {
      scaleService.checkTolerance.mockReturnValue({ withinTolerance: true });
      const result = await caller.scale.checkTolerance({ scaleWeightMg: 10000, storedWeightMg: 10050 });
      expect(scaleService.checkTolerance).toHaveBeenCalledWith({
        scaleWeightMg: 10000,
        storedWeightMg: 10050,
        tolerancePercent: 1,
      });
      expect(result).toEqual({ withinTolerance: true });
    });

    it('rejects tolerance above 100 percent', async () => {
      await expect(
        caller.scale.checkTolerance({ scaleWeightMg: 1, storedWeightMg: 1, tolerancePercent: 101 }),
      ).rejects.toThrow();
    });
  });

  describe('scale.processReading', () => {
    it('processes a raw scale reading', async () => {
      scaleService.processReading.mockResolvedValue({ accepted: true });
      const input = {
        weightGrams: 10.5,
        weightMg: 10500,
        isStable: true,
        deviceId: DEVICE_ID,
        timestamp,
      };
      const result = await caller.scale.processReading(input);
      expect(scaleService.processReading).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ weightMg: 10500, unit: 'g', isStable: true }),
      );
      expect(result).toEqual({ accepted: true });
    });
  });

  // ─── Printer ───────────────────────────────────────────
  describe('printer.templates.list', () => {
    it('lists label templates for the tenant', async () => {
      printerService.listTemplates.mockResolvedValue([]);
      const result = await caller.printer.templates.list();
      expect(printerService.listTemplates).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual([]);
    });
  });

  describe('printer.templates.create', () => {
    it('creates the label template', async () => {
      printerService.createTemplate.mockResolvedValue({ id: TEMPLATE_ID });
      const result = await caller.printer.templates.create({
        name: 'Tag 40x20',
        width: 40,
        height: 20,
        fields: [{ type: 'text', x: 1, y: 1, width: 30, height: 5, value: '{{sku}}' }],
      });
      expect(printerService.createTemplate).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ name: 'Tag 40x20', width: 40 }),
      );
      expect(result).toEqual({ id: TEMPLATE_ID });
    });

    it('rejects a template with an unknown field type', async () => {
      await expect(
        caller.printer.templates.create({
          name: 'Bad',
          width: 40,
          height: 20,
          fields: [{ type: 'video' as never, x: 0, y: 0, width: 1, height: 1, value: 'x' }],
        }),
      ).rejects.toThrow();
    });
  });

  describe('printer.templates.update', () => {
    it('updates the template with partial data', async () => {
      printerService.updateTemplate.mockResolvedValue({ id: TEMPLATE_ID, name: 'New' });
      const result = await caller.printer.templates.update({
        templateId: TEMPLATE_ID,
        data: { name: 'New' },
      });
      expect(printerService.updateTemplate).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        TEMPLATE_ID,
        expect.objectContaining({ name: 'New' }),
      );
      expect(result).toEqual({ id: TEMPLATE_ID, name: 'New' });
    });
  });

  describe('printer.templates.delete', () => {
    it('deletes the template', async () => {
      printerService.deleteTemplate.mockResolvedValue({ success: true });
      const result = await caller.printer.templates.delete({ templateId: TEMPLATE_ID });
      expect(printerService.deleteTemplate).toHaveBeenCalledWith('tenant-1', TEMPLATE_ID);
      expect(result).toEqual({ success: true });
    });
  });

  describe('printer.templates.getById', () => {
    it('returns the template', async () => {
      printerService.getTemplate.mockResolvedValue({ id: TEMPLATE_ID });
      const result = await caller.printer.templates.getById({ templateId: TEMPLATE_ID });
      expect(printerService.getTemplate).toHaveBeenCalledWith('tenant-1', TEMPLATE_ID);
      expect(result).toEqual({ id: TEMPLATE_ID });
    });
  });

  describe('printer.print', () => {
    it('generates print data with one copy by default', async () => {
      printerService.generatePrintData.mockResolvedValue({ command: '^XA' });
      const result = await caller.printer.print({
        templateId: TEMPLATE_ID,
        data: { sku: 'SKU-1' },
        printerId: PRINTER_ID,
      });
      expect(printerService.generatePrintData).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ templateId: TEMPLATE_ID, copies: 1, printerId: PRINTER_ID }),
      );
      expect(result).toEqual({ command: '^XA' });
    });

    it('rejects more than 100 copies', async () => {
      await expect(
        caller.printer.print({
          templateId: TEMPLATE_ID,
          data: {},
          copies: 101,
          printerId: PRINTER_ID,
        }),
      ).rejects.toThrow();
    });
  });

  describe('printer.printBulk', () => {
    it('generates bulk print data with per-item copies defaulted', async () => {
      printerService.generateBulkPrintData.mockResolvedValue({ jobs: 1 });
      const result = await caller.printer.printBulk({
        templateId: TEMPLATE_ID,
        items: [{ data: { sku: 'A' } }],
        printerId: PRINTER_ID,
      });
      expect(printerService.generateBulkPrintData).toHaveBeenCalledWith('tenant-1', {
        templateId: TEMPLATE_ID,
        items: [{ data: { sku: 'A' }, copies: 1 }],
        printerId: PRINTER_ID,
      });
      expect(result).toEqual({ jobs: 1 });
    });

    it('rejects an empty items list', async () => {
      await expect(
        caller.printer.printBulk({ templateId: TEMPLATE_ID, items: [], printerId: PRINTER_ID }),
      ).rejects.toThrow();
    });
  });

  describe('printer.preview', () => {
    it('renders a preview of the template', async () => {
      printerService.preview.mockResolvedValue({ renderedFields: [] });
      const result = await caller.printer.preview({
        templateId: TEMPLATE_ID,
        data: { sku: 'SKU-1' },
      });
      expect(printerService.preview).toHaveBeenCalledWith('tenant-1', TEMPLATE_ID, { sku: 'SKU-1' });
      expect(result).toEqual({ renderedFields: [] });
    });
  });

  describe('printer.jewelryLabel', () => {
    it('generates a jewelry label for the product', async () => {
      printerService.generateJewelryLabel.mockResolvedValue({ productId: PRODUCT_ID });
      const result = await caller.printer.jewelryLabel({
        templateId: TEMPLATE_ID,
        productId: PRODUCT_ID,
      });
      expect(printerService.generateJewelryLabel).toHaveBeenCalledWith('tenant-1', TEMPLATE_ID, PRODUCT_ID);
      expect(result).toEqual({ productId: PRODUCT_ID });
    });
  });

  // ─── Customer display ──────────────────────────────────
  describe('display.sendMessage', () => {
    it('sends the message to the customer display', async () => {
      displayService.sendMessage.mockResolvedValue({ delivered: true });
      const input = { line1: 'Total', line2: 'Thank you', amount: 50000, deviceId: DEVICE_ID };
      const result = await caller.display.sendMessage(input);
      expect(displayService.sendMessage).toHaveBeenCalledWith('tenant-1', input);
      expect(result).toEqual({ delivered: true });
    });

    it('rejects a line longer than 40 characters', async () => {
      await expect(
        caller.display.sendMessage({ line1: 'x'.repeat(41), deviceId: DEVICE_ID }),
      ).rejects.toThrow();
    });
  });

  describe('display.clear', () => {
    it('clears the display', async () => {
      displayService.clearDisplay.mockResolvedValue({ cleared: true });
      const result = await caller.display.clear({ deviceId: DEVICE_ID });
      expect(displayService.clearDisplay).toHaveBeenCalledWith('tenant-1', DEVICE_ID);
      expect(result).toEqual({ cleared: true });
    });
  });

  // ─── Biometric ─────────────────────────────────────────
  describe('biometric.processEvent', () => {
    it('processes a check-in event', async () => {
      biometricService.processEvent.mockResolvedValue({ processed: true });
      const input = { employeeCode: 'EMP-01', eventType: 'CHECK_IN' as const, timestamp, deviceId: DEVICE_ID };
      const result = await caller.biometric.processEvent(input);
      expect(biometricService.processEvent).toHaveBeenCalledWith('tenant-1', input);
      expect(result).toEqual({ processed: true });
    });

    it('rejects an unknown event type', async () => {
      await expect(
        caller.biometric.processEvent({
          employeeCode: 'EMP-01',
          eventType: 'LUNCH' as never,
          timestamp,
          deviceId: DEVICE_ID,
        }),
      ).rejects.toThrow();
    });
  });

  describe('biometric.getAttendance', () => {
    it('queries attendance with the given filters', async () => {
      biometricService.getAttendance.mockResolvedValue([]);
      const input = { deviceId: DEVICE_ID, date: '2026-11-01', employeeCode: 'EMP-01' };
      const result = await caller.biometric.getAttendance(input);
      expect(biometricService.getAttendance).toHaveBeenCalledWith('tenant-1', input);
      expect(result).toEqual([]);
    });
  });

  describe('biometric.getSummary', () => {
    it('returns the attendance summary for the date', async () => {
      biometricService.getAttendanceSummary.mockResolvedValue({ present: 4 });
      const result = await caller.biometric.getSummary({ date: '2026-11-01' });
      expect(biometricService.getAttendanceSummary).toHaveBeenCalledWith('tenant-1', '2026-11-01', undefined);
      expect(result).toEqual({ present: 4 });
    });

    it('passes the device filter when provided', async () => {
      biometricService.getAttendanceSummary.mockResolvedValue({ present: 1 });
      await caller.biometric.getSummary({ date: '2026-11-01', deviceId: DEVICE_ID_2 });
      expect(biometricService.getAttendanceSummary).toHaveBeenCalledWith('tenant-1', '2026-11-01', DEVICE_ID_2);
    });
  });

  // ─── Authorization negatives ───────────────────────────
  describe('authorization', () => {
    it('rejects unauthenticated callers', async () => {
      const anon = routerInstance.router.createCaller({});
      await expect(anon.devices.list({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    // Mounted under the key the app uses (trpc.router.ts: `hardware`); the
    // hardware module maps to the `retail` permission module in rbac.ts.
    const mountedAs = (permissions: string[]) =>
      trpc.router({ hardware: routerInstance.router }).createCaller({ ...ctx, userPermissions: permissions });

    it('allows read procedures to a retail-scoped read-only user', async () => {
      deviceService.listDevices.mockResolvedValue({ items: [] });
      const readOnly = mountedAs(['retail.*.read']);
      await expect(readOnly.hardware.devices.list({})).resolves.toEqual({ items: [] });
    });

    it('denies write procedures to a read-only retail user', async () => {
      const readOnly = mountedAs(['retail.*.read']);
      await expect(
        readOnly.hardware.devices.register(deviceConfig),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(deviceService.registerDevice).not.toHaveBeenCalled();
    });

    it('denies a user with no retail permission', async () => {
      const noAccess = mountedAs(['financial.*.read']);
      await expect(noAccess.hardware.devices.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});
