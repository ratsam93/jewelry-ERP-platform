// Client-side GST preview for the POS cart. The API recomputes tax authoritatively
// on sale creation (retail.pricing.service.ts); this mirrors its rules so the
// cashier sees the same figures. Integer paise math only. Rates are percent * 100.

const JEWELRY_GST_RATE = 300;
const MAKING_CHARGES_GST_RATE = 500;

export interface TaxableLine {
  unitPricePaise: number;
  quantity: number;
  discountPaise: number;
  makingChargesPaise: number;
  gstRate: number;
}

export interface LineTax {
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxablePaise: number;
  lineTotalPaise: number;
}

function roundDiv(numerator: number, denominator: number): number {
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

/** Intra-state by default (POS location state == customer state); pass interState for IGST. */
export function computeLineTax(line: TaxableLine, interState = false): LineTax {
  const base = line.unitPricePaise * line.quantity;
  const taxable = base - line.discountPaise;

  let makingTaxable = 0;
  const makingGross = line.makingChargesPaise * line.quantity;
  if (line.gstRate === JEWELRY_GST_RATE && makingGross > 0 && base > 0) {
    const capped = Math.min(makingGross, base);
    makingTaxable = capped - Math.floor((line.discountPaise * capped) / base);
    makingTaxable = Math.max(0, Math.min(makingTaxable, taxable));
  }
  const metalTaxable = taxable - makingTaxable;
  const makingRate = makingTaxable > 0 ? MAKING_CHARGES_GST_RATE : line.gstRate;
  const numerator = metalTaxable * line.gstRate + makingTaxable * makingRate;

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;
  if (interState) {
    igstPaise = roundDiv(numerator, 10000);
  } else {
    cgstPaise = roundDiv(numerator, 20000);
    sgstPaise = cgstPaise;
  }
  return {
    cgstPaise,
    sgstPaise,
    igstPaise,
    taxablePaise: taxable,
    lineTotalPaise: taxable + cgstPaise + sgstPaise + igstPaise,
  };
}
