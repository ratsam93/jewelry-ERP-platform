'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { TraceabilityTimeline, HuidBadge } from '@/features/compliance';
import { renderDetailState } from '@/components/detail-states';

export default function ProductTraceabilityPage() {
  const { productId } = useParams<{ productId: string }>();
  const { data, isLoading, error, refetch } = trpc.compliance.traceability.getChain.useQuery({ productId });

  const state = renderDetailState({
    isLoading,
    error,
    data,
    entity: 'Product',
    backHref: '/compliance/traceability',
    onRetry: () => void refetch(),
  });
  if (state || !data) return state ?? null;

  const product = data.product as { id: string; sku: string; name: string };
  const huid = data.huidRecord as { huidNumber: string; status: string } | null;
  const certs = (data.certificates ?? []) as Array<{
    certificateNumber: string;
    issuingLab: string;
    isVerified: boolean;
  }>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Traceability: ${product.name}`}
        description={`SKU: ${product.sku}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Compliance', href: '/compliance' },
          { label: 'Traceability', href: '/compliance/traceability' },
          { label: product.sku },
        ]}
      />

      {/* Product summary */}
      <div className="flex items-center gap-4 rounded-lg border p-4">
        <div className="flex-1">
          <div className="text-sm font-medium">{product.name}</div>
          <div className="text-xs text-muted-foreground">SKU: {product.sku}</div>
        </div>
        {huid && (
          <HuidBadge huidNumber={huid.huidNumber} status={huid.status} size="md" />
        )}
        {!huid && <HuidBadge huidNumber={null} />}
      </div>

      {/* Certificates */}
      {certs.length > 0 && (
        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-2">Certificates</h3>
          <div className="flex flex-wrap gap-2">
            {certs.map((cert) => (
              <span
                key={cert.certificateNumber}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  cert.isVerified
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {cert.issuingLab}: {cert.certificateNumber}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Chain of Custody Timeline */}
      <div className="rounded-lg border p-4">
        <h3 className="text-sm font-semibold mb-4">Chain of Custody</h3>
        <TraceabilityTimeline events={(data.events ?? []) as unknown as Array<{
          id: string;
          eventType: string;
          fromEntityType: string | null;
          fromEntityId: string | null;
          toEntityType: string | null;
          toEntityId: string | null;
          eventDate: string;
          documentReference: string | null;
          notes: string | null;
        }>} />
      </div>
    </div>
  );
}
