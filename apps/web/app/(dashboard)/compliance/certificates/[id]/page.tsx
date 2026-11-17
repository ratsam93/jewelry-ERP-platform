'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { Award, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { renderDetailState } from '@/components/detail-states';

export default function CertificateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: cert, isLoading, error, refetch } = trpc.compliance.certificates.getById.useQuery({ id });
  const utils = trpc.useUtils();
  const onDone = () => utils.compliance.certificates.getById.invalidate({ id });
  const verifyMutation = trpc.compliance.certificates.verify.useMutation({ onSuccess: onDone });
  const manualVerifyMutation = trpc.compliance.certificates.manualVerifyCertificate.useMutation({
    onSuccess: onDone,
  });

  const handleManualVerify = () => {
    if (
      window.confirm(
        'Confirm that you have checked this certificate against the physical report or the lab website. ' +
          'It will be recorded as manually verified by you.',
      )
    ) {
      manualVerifyMutation.mutate({ id });
    }
  };
  // Result of the latest action in this session (the DB stores verified flag + date only).
  const lastResult = (manualVerifyMutation.data ?? verifyMutation.data) as
    | { status?: string; verificationMode?: string }
    | undefined;

  const state = renderDetailState({
    isLoading,
    error,
    data: cert,
    entity: 'Certificate',
    backHref: '/compliance/certificates',
    onRetry: () => void refetch(),
  });
  if (state || !cert) return state ?? null;

  const product = cert.product as { id: string; sku: string; name: string } | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Certificate: ${cert.certificateNumber}`}
        description={`${cert.issuingLab} - ${cert.stoneType}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Compliance', href: '/compliance' },
          { label: 'Certificates', href: '/compliance/certificates' },
          { label: cert.certificateNumber as string },
        ]}
        actions={
          !cert.isVerified ? (
            <div className="flex gap-2">
            <button
              onClick={handleManualVerify}
              disabled={manualVerifyMutation.isPending}
              className="inline-flex h-9 items-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" />
              {manualVerifyMutation.isPending ? 'Saving...' : 'Mark as manually verified'}
            </button>
            <button
              onClick={() => verifyMutation.mutate({ id })}
              disabled={verifyMutation.isPending}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" />
              {verifyMutation.isPending ? 'Verifying...' : 'Verify with Lab'}
            </button>
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Certificate Image */}
        <div className="rounded-lg border p-4">
          <div className="aspect-square rounded-md bg-muted flex items-center justify-center overflow-hidden">
            {cert.imageUrl ? (
              <img src={cert.imageUrl as string} alt={cert.certificateNumber as string} className="h-full w-full object-contain" />
            ) : (
              <Award className="h-16 w-16 text-muted-foreground/20" />
            )}
          </div>
          {cert.certificateUrl && (
            <a
              href={cert.certificateUrl as string}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              View Full Certificate <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Details */}
        <div className="space-y-6">
          {/* Verification status */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {cert.isVerified ? (
                <>
                  <CheckCircle className="h-5 w-5 text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    VERIFIED{lastResult?.verificationMode ? ` (${lastResult.verificationMode})` : ''}
                    {cert.verifiedAt ? ` on ${new Date(cert.verifiedAt as unknown as string | Date).toLocaleDateString()}` : ''}
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-amber-500" />
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                    PENDING_VERIFICATION
                  </span>
                </>
              )}
            </div>
            {!cert.isVerified && (
              <p className="text-xs text-muted-foreground">
                {lastResult?.status === 'PENDING_VERIFICATION'
                  ? 'No lab API is configured for this lab (mode: MANUAL). Check the certificate with the lab, then mark it as manually verified.'
                  : 'Not verified yet. Verify with the lab API or mark as manually verified after checking.'}
              </p>
            )}
            {(verifyMutation.error || manualVerifyMutation.error) && (
              <p className="text-xs text-destructive">
                {(verifyMutation.error ?? manualVerifyMutation.error)?.message}
              </p>
            )}
          </div>

          {/* Stone details */}
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="text-sm font-semibold">Stone Details (4Cs)</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Lab</div>
                <div className="font-medium">{cert.issuingLab as string}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Stone Type</div>
                <div>{cert.stoneType as string}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Carat Weight</div>
                <div>{((cert.caratWeight as number) / 100).toFixed(2)} ct</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Shape</div>
                <div>{(cert.shape as string) ?? '-'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Color</div>
                <div>{(cert.color as string) ?? '-'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Clarity</div>
                <div>{(cert.clarity as string) ?? '-'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Cut</div>
                <div>{(cert.cut as string) ?? '-'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Fluorescence</div>
                <div>{(cert.fluorescence as string) ?? '-'}</div>
              </div>
              {cert.dimensions && (
                <div className="col-span-2">
                  <div className="text-xs text-muted-foreground">Dimensions</div>
                  <div>{cert.dimensions as string}</div>
                </div>
              )}
            </div>
          </div>

          {/* Product link */}
          {product && (
            <div className="rounded-lg border p-4">
              <h3 className="text-sm font-semibold mb-2">Linked Product</h3>
              <div className="text-sm">
                <span className="font-mono text-muted-foreground">{product.sku}</span> - {product.name}
              </div>
              <Link
                href={`/compliance/traceability/${product.id}`}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2"
              >
                View Traceability
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
