'use client';

import { useState } from 'react';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { RfidScanMonitor } from '@/features/hardware/RfidScanMonitor';
import { RfidStockTakeWizard } from '@/features/hardware/RfidStockTakeWizard';
import { SerialPicker } from '@/features/hardware/SerialPicker';
import { LocationSelect } from '@/features/inventory/location-select';
import { validateEpc } from '@/features/hardware/hardware-utils';
import { formatServerError } from '@/lib/manufacturing-forms';

type ActiveTab = 'stock-take' | 'encode' | 'monitor' | 'anti-theft';

export default function RfidManagementPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('stock-take');
  const [_encodeSerial, setEncodeSerial] = useState('');
  const [encodeTagData, setEncodeTagData] = useState('');
  const [encodeSerialId, setEncodeSerialId] = useState('');
  const [monitorLocationId, setMonitorLocationId] = useState('');
  const [antiTheftEpc, setAntiTheftEpc] = useState('');
  const [antiTheftLocationId, setAntiTheftLocationId] = useState('');
  const [epcTouched, setEpcTouched] = useState(false);
  const epcError = validateEpc(encodeTagData);
  const encodeHint = !encodeSerialId
    ? 'Select a stock item to enable Write Tag.'
    : epcError
      ? epcError
      : null;

  const writeTagMutation = trpc.hardware.rfid.writeTag.useMutation({
    onSuccess: () => {
      setEncodeSerial('');
      setEncodeTagData('');
      setEncodeSerialId('');
    },
  });

  const antiTheftQuery = trpc.hardware.rfid.antiTheftCheck.useQuery(
    { tagId: antiTheftEpc, epc: antiTheftEpc, locationId: antiTheftLocationId },
    { enabled: false },
  );

  const handleEncodeTag = () => {
    setEpcTouched(true);
    if (!encodeSerialId || epcError) return;
    const epc = encodeTagData.trim().toUpperCase();
    writeTagMutation.mutate({
      serialNumberId: encodeSerialId,
      data: { tagId: epc, data: epc },
    });
  };

  const tabs: { id: ActiveTab; label: string }[] = [
    { id: 'stock-take', label: 'Stock Take' },
    { id: 'encode', label: 'Tag Encoding' },
    { id: 'monitor', label: 'Scan Monitor' },
    { id: 'anti-theft', label: 'Anti-Theft' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="RFID Management"
        description="RFID-based stock taking, tag encoding, scan monitoring, and anti-theft configuration."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Settings', href: '/settings' },
          { label: 'Hardware', href: '/settings/hardware' },
          { label: 'RFID Management' },
        ]}
      />

      {/* Tab Navigation */}
      <div className="flex border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === tab.id
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stock Take Tab */}
      {activeTab === 'stock-take' && (
        <RfidStockTakeWizard />
      )}

      {/* Tag Encoding Tab */}
      {activeTab === 'encode' && (
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Encode RFID Tag</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Associate an RFID tag with a product serial number by writing the EPC data to the tag.
          </p>
          <div className="max-w-md space-y-4">
            <div>
              <label className="block text-sm font-medium" htmlFor="encode-serial-id">
                Stock Item <span className="text-red-600" aria-hidden="true">*</span>
              </label>
              <div className="mt-1">
                <SerialPicker id="encode-serial-id" value={encodeSerialId} onChange={setEncodeSerialId} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium" htmlFor="encode-tag-data">
                RFID Tag EPC Data (hex) <span className="text-red-600" aria-hidden="true">*</span>
              </label>
              <input
                id="encode-tag-data"
                type="text"
                value={encodeTagData}
                onChange={(e) => setEncodeTagData(e.target.value)}
                onBlur={() => setEpcTouched(true)}
                aria-invalid={epcTouched && !!epcError}
                className={`mt-1 w-full rounded-md border px-3 py-2 font-mono text-sm ${epcTouched && epcError ? 'border-red-500' : ''}`}
                placeholder="e.g. 3034257BF7194E4000000001"
              />
              {epcTouched && epcError && (
                <p role="alert" className="mt-1 text-xs text-red-600">{epcError}</p>
              )}
            </div>
            <button
              onClick={handleEncodeTag}
              disabled={!!encodeHint || writeTagMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {writeTagMutation.isPending ? 'Writing...' : 'Write Tag'}
            </button>
            {encodeHint && (
              <p className="text-xs text-muted-foreground">{encodeHint}</p>
            )}
            {writeTagMutation.isSuccess && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                Tag encoded successfully.
              </div>
            )}
            {writeTagMutation.isError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                Failed to encode tag: {formatServerError(writeTagMutation.error)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scan Monitor Tab */}
      {activeTab === 'monitor' && (
        <div className="space-y-4">
          <div className="max-w-md">
            <label className="block text-sm font-medium" htmlFor="monitor-location">Location</label>
            <LocationSelect
              id="monitor-location"
              value={monitorLocationId}
              onChange={setMonitorLocationId}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
            {!monitorLocationId && (
              <p className="mt-1 text-xs text-muted-foreground">Select a location to start monitoring scans.</p>
            )}
          </div>
          {monitorLocationId && (
            <RfidScanMonitor locationId={monitorLocationId} />
          )}
        </div>
      )}

      {/* Anti-Theft Tab */}
      {activeTab === 'anti-theft' && (
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Anti-Theft Check</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Validate an RFID tag at exit points. Items with status "SOLD" or "IN_TRANSIT" are authorized to leave.
          </p>
          <div className="max-w-md space-y-4">
            <div>
              <label className="block text-sm font-medium" htmlFor="at-epc">Tag EPC Code</label>
              <input
                id="at-epc"
                type="text"
                value={antiTheftEpc}
                onChange={(e) => setAntiTheftEpc(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="EPC code from tag"
              />
            </div>
            <div>
              <label className="block text-sm font-medium" htmlFor="at-location">Exit point location</label>
              <LocationSelect
                id="at-location"
                value={antiTheftLocationId}
                onChange={setAntiTheftLocationId}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={() => void antiTheftQuery.refetch()}
              disabled={!antiTheftEpc || !antiTheftLocationId || antiTheftQuery.isFetching}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {antiTheftQuery.isFetching ? 'Checking...' : 'Check Tag'}
            </button>
            {(!antiTheftEpc || !antiTheftLocationId) && (
              <p className="text-xs text-muted-foreground">Enter a tag EPC and select a location to enable Check Tag.</p>
            )}
            {antiTheftQuery.isError && (
              <p role="alert" className="text-sm text-red-600">{formatServerError(antiTheftQuery.error)}</p>
            )}
            {antiTheftQuery.data && (
              <div
                className={`rounded-md border p-4 ${
                  antiTheftQuery.data.isAuthorized
                    ? 'border-green-200 bg-green-50'
                    : 'border-red-200 bg-red-50'
                }`}
              >
                <p
                  className={`text-lg font-bold ${
                    antiTheftQuery.data.isAuthorized ? 'text-green-700' : 'text-red-700'
                  }`}
                >
                  {antiTheftQuery.data.isAuthorized ? 'AUTHORIZED' : 'UNAUTHORIZED'}
                </p>
                {antiTheftQuery.data.productName && (
                  <p className="text-sm">Product: {antiTheftQuery.data.productName}</p>
                )}
                {antiTheftQuery.data.serialNumber && (
                  <p className="text-sm">Serial: {antiTheftQuery.data.serialNumber}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{antiTheftQuery.data.reason}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
