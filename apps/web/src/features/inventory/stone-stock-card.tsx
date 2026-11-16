'use client';

import { Diamond } from 'lucide-react';

interface StoneStockCardProps {
  stoneType: string;
  shape: string | null;
  color: string | null;
  clarity: string | null;
  cutGrade: string | null;
  polish?: string | null;
  symmetry?: string | null;
  fluorescence?: string | null;
  origin?: 'NATURAL' | 'LAB_GROWN';
  growthMethod?: 'NONE' | 'HPHT' | 'CVD';
  treatment?: string | null;
  reportLab?: string | null;
  sizeRange: string | null;
  /** Preferred: integer milligrams (1 ct = 200 mg). */
  totalWeightMg?: number | bigint | null;
  /** Legacy whole carats; only used when totalWeightMg is missing/zero. */
  totalWeightCt?: number;
  totalPieces: number;
  valuePaise: number;
  certificationNumber: string | null;
}

export function StoneStockCard({
  stoneType,
  shape,
  color,
  clarity,
  cutGrade,
  polish,
  symmetry,
  fluorescence,
  origin = 'NATURAL',
  growthMethod = 'NONE',
  treatment,
  reportLab,
  sizeRange,
  totalWeightMg,
  totalWeightCt = 0,
  totalPieces,
  valuePaise,
  certificationNumber,
}: StoneStockCardProps) {
  const valueRupees = valuePaise / 100;
  // Weights are stored in integer mg; 1 ct = 200 mg. Legacy rows fall back to whole carats.
  const mg = Number(totalWeightMg ?? 0);
  const weightCt = mg > 0 ? mg / 200 : totalWeightCt;
  const originLabel =
    origin === 'LAB_GROWN'
      ? 'Lab-grown' + (growthMethod !== 'NONE' ? ' (' + growthMethod + ')' : '')
      : 'Natural';

  const fourCsItems = [
    color && { label: 'Color', value: color },
    clarity && { label: 'Clarity', value: clarity },
    cutGrade && { label: 'Cut', value: cutGrade },
    polish && { label: 'Polish', value: polish },
    symmetry && { label: 'Symmetry', value: symmetry },
    fluorescence && { label: 'Fluor.', value: fluorescence },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <div className="rounded-lg border bg-card p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Diamond className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">{stoneType}</span>
        </div>
        <div className="flex items-center gap-1">
          <span
            data-testid="origin-badge"
            className={
              origin === 'LAB_GROWN'
                ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800'
                : 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800'
            }
          >
            {originLabel}
          </span>
          {shape && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{shape}</span>
          )}
        </div>
      </div>
      {treatment && treatment !== 'NONE' && (
        <div className="mt-1 text-xs text-muted-foreground">Treatment: {treatment.replace(/_/g, ' ')}</div>
      )}

      {/* 4Cs */}
      {fourCsItems.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {fourCsItems.map((item) => (
            <div key={item.label} className="rounded-md border px-2 py-1">
              <div className="text-[10px] text-muted-foreground">{item.label}</div>
              <div className="text-xs font-medium">{item.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div>
          <div className="text-xs text-muted-foreground">Weight</div>
          <div className="text-sm font-semibold">{weightCt.toFixed(2)} ct</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Pieces</div>
          <div className="text-sm font-semibold">{totalPieces}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Size</div>
          <div className="text-sm font-semibold">{sizeRange ?? '-'}</div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t">
        <div className="text-sm font-semibold">
          {valueRupees.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
        </div>
        {totalPieces > 0 && (
          <div className="text-xs text-muted-foreground">
            {(valueRupees / totalPieces).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}/pc
          </div>
        )}
      </div>

      {certificationNumber && (
        <div className="mt-2 text-xs text-muted-foreground">
          Cert: {certificationNumber}{reportLab ? ' (' + reportLab + ')' : ''}
        </div>
      )}
    </div>
  );
}
