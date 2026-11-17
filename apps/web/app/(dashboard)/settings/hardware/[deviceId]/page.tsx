'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { ConnectionType, DeviceStatus } from '@caratflow/shared-types';
import type { UpdateDeviceConfig } from '@caratflow/shared-types';
import { DeviceStatusIndicator } from '@/features/hardware/DeviceStatusIndicator';
import { DEVICE_TYPE_LABELS, CONNECTION_TYPE_LABELS, validateDeviceForm } from '@/features/hardware/hardware-utils';
import { formatServerError } from '@/lib/manufacturing-forms';
import { Save, ArrowLeft } from 'lucide-react';

export default function DeviceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params.deviceId as string;

  const { data: device, isLoading, refetch } = trpc.hardware.devices.getById.useQuery({ deviceId });
  const { data: statusData } = trpc.hardware.devices.getStatus.useQuery({ deviceId });

  const branchesQuery = trpc.platform.branches.list.useQuery({ includeInactive: true });
  const branchName = ((branchesQuery.data as Array<{ id: string; name: string }> | undefined) ?? []).find(
    (b) => b.id === device?.locationId,
  )?.name;
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<UpdateDeviceConfig>({});

  const updateMutation = trpc.hardware.devices.update.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      void refetch();
    },
  });

  const handleStartEdit = () => {
    if (device) {
      setEditData({
        name: device.name,
        deviceType: device.deviceType,
        connectionType: device.connectionType,
        port: device.port ?? undefined,
        baudRate: device.baudRate ?? undefined,
        ipAddress: device.ipAddress ?? undefined,
        tcpPort: device.tcpPort ?? undefined,
        vendorId: device.vendorId ?? undefined,
        productId: device.productId ?? undefined,
        isActive: device.isActive,
        locationId: device.locationId,
      });
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    const errs = validateDeviceForm({
      name: editData.name ?? '',
      connectionType: editData.connectionType ?? '',
      locationId: editData.locationId ?? '',
      port: editData.port,
      ipAddress: editData.ipAddress,
      tcpPort: editData.tcpPort,
      vendorId: editData.vendorId,
      productId: editData.productId,
    });
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;
    updateMutation.mutate({ deviceId, data: editData });
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">Loading device...</div>
    );
  }

  if (!device) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">Device not found</div>
    );
  }

  const currentStatus = (statusData?.status as DeviceStatus) ?? DeviceStatus.DISCONNECTED;

  return (
    <div className="space-y-6">
      <PageHeader
        title={device.name}
        description={`${DEVICE_TYPE_LABELS[device.deviceType]} - ${CONNECTION_TYPE_LABELS[device.connectionType]}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Settings', href: '/settings' },
          { label: 'Hardware', href: '/settings/hardware' },
          { label: device.name },
        ]}
      />

      {/* Status + Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DeviceStatusIndicator deviceId={deviceId} initialStatus={currentStatus} showLabel size="lg" />
          {device.lastSeenAt && (
            <span className="text-xs text-muted-foreground">
              Last seen: {new Date(device.lastSeenAt).toLocaleString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/settings/hardware')}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          {!isEditing ? (
            <button
              onClick={handleStartEdit}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Edit Configuration
            </button>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(false)}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {updateMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>

      {(updateMutation.isError || Object.keys(formErrors).length > 0) && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {updateMutation.isError
            ? formatServerError(updateMutation.error)
            : Object.values(formErrors).join(' ')}
        </div>
      )}

      {/* Configuration */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="border-b p-6">
          <h2 className="text-lg font-semibold">Device Configuration</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-muted-foreground">Device Name</label>
            {isEditing ? (
              <input
                type="text"
                value={editData.name ?? ''}
                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            ) : (
              <p className="mt-1 text-sm">{device.name}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground">Device Type</label>
            <p className="mt-1 text-sm">{DEVICE_TYPE_LABELS[device.deviceType]}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground">Connection Type</label>
            {isEditing ? (
              <select
                value={editData.connectionType ?? device.connectionType}
                onChange={(e) =>
                  setEditData({ ...editData, connectionType: e.target.value as ConnectionType })
                }
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              >
                {Object.entries(CONNECTION_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            ) : (
              <p className="mt-1 text-sm">{CONNECTION_TYPE_LABELS[device.connectionType]}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground">Location</label>
            <p className="mt-1 text-sm">
              {branchName ?? (branchesQuery.isLoading ? 'Loading...' : 'Unknown location')}
            </p>
          </div>

          {/* Connection-specific fields */}
          {(device.ipAddress || isEditing) && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground">IP Address</label>
              {isEditing ? (
                <input
                  type="text"
                  value={editData.ipAddress ?? ''}
                  onChange={(e) => setEditData({ ...editData, ipAddress: e.target.value })}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
              ) : (
                <p className="mt-1 text-sm">{device.ipAddress}</p>
              )}
            </div>
          )}
          {(device.tcpPort || isEditing) && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground">TCP Port</label>
              {isEditing ? (
                <input
                  type="number"
                  value={editData.tcpPort ?? ''}
                  onChange={(e) => setEditData({ ...editData, tcpPort: Number(e.target.value) })}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  min={1}
                  max={65535}
                />
              ) : (
                <p className="mt-1 text-sm">{device.tcpPort}</p>
              )}
            </div>
          )}
          {(device.port || isEditing) && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Serial Port</label>
              {isEditing ? (
                <input
                  type="text"
                  value={editData.port ?? ''}
                  onChange={(e) => setEditData({ ...editData, port: e.target.value })}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
              ) : (
                <p className="mt-1 text-sm">{device.port}</p>
              )}
            </div>
          )}
          {(device.vendorId || (isEditing && editData.connectionType === 'USB_HID')) && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Vendor ID</label>
              {isEditing ? (
                <>
                  <input
                    type="text"
                    value={editData.vendorId ?? ''}
                    onChange={(e) => setEditData({ ...editData, vendorId: e.target.value })}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="0x1234"
                  />
                  {formErrors.vendorId && <p role="alert" className="mt-1 text-xs text-red-600">{formErrors.vendorId}</p>}
                </>
              ) : (
                <p className="mt-1 text-sm font-mono">{device.vendorId}</p>
              )}
            </div>
          )}
          {(device.productId || (isEditing && editData.connectionType === 'USB_HID')) && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Product ID</label>
              {isEditing ? (
                <>
                  <input
                    type="text"
                    value={editData.productId ?? ''}
                    onChange={(e) => setEditData({ ...editData, productId: e.target.value })}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="0x5678"
                  />
                  {formErrors.productId && <p role="alert" className="mt-1 text-xs text-red-600">{formErrors.productId}</p>}
                </>
              ) : (
                <p className="mt-1 text-sm font-mono">{device.productId}</p>
              )}
            </div>
          )}
          {(device.baudRate || isEditing) && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Baud Rate</label>
              {isEditing ? (
                <select
                  value={editData.baudRate ?? 9600}
                  onChange={(e) => setEditData({ ...editData, baudRate: Number(e.target.value) })}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                >
                  {[2400, 4800, 9600, 19200, 38400, 57600, 115200].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              ) : (
                <p className="mt-1 text-sm">{device.baudRate}</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-muted-foreground">Status</label>
            {isEditing ? (
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={editData.isActive ?? device.isActive}
                  onChange={(e) => setEditData({ ...editData, isActive: e.target.checked })}
                  className="h-4 w-4 rounded border"
                  id="device-active"
                />
                <label htmlFor="device-active" className="text-sm">Active</label>
              </div>
            ) : (
              <p className="mt-1 text-sm">{device.isActive ? 'Active' : 'Inactive'}</p>
            )}
          </div>
        </div>
      </div>

      {/* Device Info */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="border-b p-6">
          <h2 className="text-lg font-semibold">Device Information</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 p-6 text-sm">
          <div>
            <span className="text-muted-foreground">Device ID</span>
            <p className="font-mono text-xs">{device.id}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Created</span>
            <p>{new Date(device.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Last Updated</span>
            <p>{new Date(device.updatedAt).toLocaleString()}</p>
          </div>
          {device.lastSeenAt && (
            <div>
              <span className="text-muted-foreground">Last Seen</span>
              <p>{new Date(device.lastSeenAt).toLocaleString()}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
