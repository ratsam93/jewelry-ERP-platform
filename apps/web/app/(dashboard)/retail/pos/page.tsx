'use client';

import { pickDefaultLocation, dedupeBranches, branchOptionLabels, type PosBranch } from '@/lib/pos-location';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart, User, Printer, AlertCircle, CheckCircle2, Search, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { SalePaymentMethod } from '@caratflow/shared-types';
import { PosProductSearch } from '../../../../src/features/retail/PosProductSearch';
import { PosCart, type CartItem } from '../../../../src/features/retail/PosCart';
import { PosPaymentDialog } from '../../../../src/features/retail/PosPaymentDialog';
import { MetalRateDisplay } from '../../../../src/features/retail/MetalRateDisplay';
import { computeLineTax } from '../../../../src/features/retail/posTax';

// ─── Hooks ────────────────────────────────────────────────────────
function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

// ─── Types shaping the tRPC payload we care about ─────────────────
interface StockItemRow {
  id: string;
  productId: string;
  locationId: string;
  quantityOnHand: number;
  quantityAvailable: number;
  product?: {
    id: string;
    sku: string;
    name: string;
    productType: string;
    sellingPricePaise: number | null;
    costPricePaise: number | null;
  };
}

interface PosProduct {
  id: string; // productId
  sku: string;
  name: string;
  productType: string;
  metalWeightMg: number | null;
  metalPurity: number | null;
  makingCharges: number | null;
  sellingPricePaise: number | null;
}

interface CustomerRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
}

type BranchRow = PosBranch;

// ─── Live metal rates ─────────────────────────────────────────────
interface LiveRateRow {
  metalType: string;
  purity: number;
  ratePerGramPaise: number;
  changePercent: number | null;
}

/** Pick the gold (prefer 22K / 916) and silver rows from the live rate list. */
function pickRate(rates: LiveRateRow[], metal: 'GOLD' | 'SILVER'): LiveRateRow | null {
  const rows = rates.filter((r) => r.metalType.toUpperCase() === metal);
  if (rows.length === 0) return null;
  if (metal === 'GOLD') {
    return rows.find((r) => r.purity === 916 || r.purity === 22) ?? rows[0];
  }
  return rows[0];
}

function mapStockItemToProduct(item: StockItemRow): PosProduct {
  const p = item.product;
  return {
    id: item.productId,
    sku: p?.sku ?? '',
    name: p?.name ?? 'Unknown product',
    productType: p?.productType ?? 'OTHER',
    metalWeightMg: null,
    metalPurity: null,
    makingCharges: null,
    sellingPricePaise: p?.sellingPricePaise ?? null,
  };
}

export default function PosPage() {
  const router = useRouter();

  // ─── Live metal rates (no hardcoded fallback: priced from the rate feed) ──
  const ratesQuery = trpc.india.rates.getAll.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });
  const liveRates: LiveRateRow[] = React.useMemo(
    () => (ratesQuery.data as LiveRateRow[] | undefined) ?? [],
    [ratesQuery.data],
  );
  const goldRate = pickRate(liveRates, 'GOLD');
  const silverRate = pickRate(liveRates, 'SILVER');

  // ─── Location (branch) ──────────────────────────────────────────
  const branchesQuery = trpc.platform.branches.list.useQuery({ includeInactive: false });
  const branches: BranchRow[] = React.useMemo(
    () => dedupeBranches((branchesQuery.data as BranchRow[] | undefined) ?? []),
    [branchesQuery.data],
  );
  const branchLabels = React.useMemo(() => branchOptionLabels(branches), [branches]);
  const [locationId, setLocationIdState] = React.useState<string>('');
  const userPickedLocation = React.useRef(false);
  const setLocationId = (id: string) => {
    userPickedLocation.current = true;
    setLocationIdState(id);
  };
  // Which locations hold stock (unfiltered query), so we default to one with products.
  const stockOverviewQuery = trpc.inventory.stockItems.list.useQuery(
    { page: 1, limit: 100, sortOrder: 'desc' as const },
    { enabled: branches.length > 0 },
  );
  const locationsWithStock = React.useMemo(() => {
    const data = stockOverviewQuery.data as { items?: StockItemRow[] } | undefined;
    if (!data?.items) return null;
    return new Set(
      data.items.filter((i) => (i.quantityAvailable ?? i.quantityOnHand ?? 0) > 0).map((i) => i.locationId),
    );
  }, [stockOverviewQuery.data]);
  React.useEffect(() => {
    if (userPickedLocation.current || branches.length === 0) return;
    if (stockOverviewQuery.isLoading) return;
    const next = pickDefaultLocation(branches, locationsWithStock);
    if (next && next !== locationId) setLocationIdState(next);
  }, [branches, locationsWithStock, stockOverviewQuery.isLoading, locationId]);

  // ─── Product search (debounced) ─────────────────────────────────
  const [productSearch, setProductSearch] = React.useState('');
  const debouncedProductSearch = useDebouncedValue(productSearch, 300);
  const productsQuery = trpc.inventory.stockItems.list.useQuery(
    {
      search: debouncedProductSearch || undefined,
      locationId: locationId || undefined,
      page: 1,
      limit: 20,
      sortOrder: 'desc' as const,
    },
    { enabled: Boolean(locationId) },
  );
  const stockItems: StockItemRow[] = React.useMemo(() => {
    const data = productsQuery.data as { items?: StockItemRow[] } | undefined;
    return data?.items ?? [];
  }, [productsQuery.data]);
  const products: PosProduct[] = React.useMemo(
    () => stockItems.map(mapStockItemToProduct),
    [stockItems],
  );

  // ─── Customer picker ────────────────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] = React.useState<{ id: string; name: string } | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = React.useState(false);
  const [customerSearch, setCustomerSearch] = React.useState('');
  const debouncedCustomerSearch = useDebouncedValue(customerSearch, 300);
  const customersQuery = trpc.crm.customerList.useQuery(
    {
      search: debouncedCustomerSearch || undefined,
      page: 1,
      limit: 50,
      sortOrder: 'desc' as const,
    },
    { enabled: customerPickerOpen },
  );
  const customers: CustomerRow[] = React.useMemo(() => {
    const data = customersQuery.data as { items?: CustomerRow[] } | undefined;
    return data?.items ?? [];
  }, [customersQuery.data]);

  // ─── Cart state ─────────────────────────────────────────────────
  const [cartItems, setCartItems] = React.useState<CartItem[]>([]);
  const [paymentDialogOpen, setPaymentDialogOpen] = React.useState(false);
  const [flash, setFlash] = React.useState<{ kind: 'error' | 'success'; msg: string } | null>(null);

  const addToCart = (product: PosProduct) => {
    const existing = cartItems.find((i) => i.productId === product.id);
    if (existing) {
      updateQuantity(existing.id, existing.quantity + 1);
      return;
    }

    // Derive unit price: prefer product.sellingPricePaise, else compute from the live metal rate
    let unitPricePaise = product.sellingPricePaise ?? 0;
    const metalWeightMg = product.metalWeightMg ?? 0;
    const makingChargesPaise = product.makingCharges ?? 0;
    const liveRate = product.productType === 'GOLD' ? goldRate : silverRate;
    const rate = liveRate?.ratePerGramPaise ?? 0;
    if (!unitPricePaise) {
      if (!liveRate) {
        setFlash({
          kind: 'error',
          msg: ratesQuery.isLoading
            ? 'Metal rates are still loading; try again in a moment.'
            : 'Live metal rate unavailable, so this item cannot be priced from weight. Set a selling price or record a rate.',
        });
        return;
      }
      const metalValuePaise = Math.round((metalWeightMg / 1000) * rate);
      unitPricePaise = metalValuePaise + makingChargesPaise;
    }

    // Per-item GST rate (percent * 100). Jewelry defaults to 3%; making charges are taxed at 5% inside computeLineTax.
    const gstRate = 300;
    const tax = computeLineTax({
      unitPricePaise,
      quantity: 1,
      discountPaise: 0,
      makingChargesPaise,
      gstRate,
    });

    const newItem: CartItem = {
      id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productId: product.id,
      description: product.name,
      quantity: 1,
      unitPricePaise,
      metalWeightMg,
      metalRatePaise: rate,
      makingChargesPaise,
      wastageChargesPaise: 0,
      discountPaise: 0,
      hsnCode: '7113',
      gstRate,
      cgstPaise: tax.cgstPaise,
      sgstPaise: tax.sgstPaise,
      igstPaise: tax.igstPaise,
      lineTotalPaise: tax.lineTotalPaise,
    };

    setCartItems((prev) => [...prev, newItem]);
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const tax = computeLineTax({ ...item, quantity });
        return {
          ...item,
          quantity,
          cgstPaise: tax.cgstPaise,
          sgstPaise: tax.sgstPaise,
          igstPaise: tax.igstPaise,
          lineTotalPaise: tax.lineTotalPaise,
        };
      }),
    );
  };

  const removeItem = (itemId: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  // ─── Totals ─────────────────────────────────────────────────────
  const subtotalPaise = cartItems.reduce(
    (sum, i) => sum + i.unitPricePaise * i.quantity - i.discountPaise,
    0,
  );
  const taxPaise = cartItems.reduce(
    (sum, i) => sum + i.cgstPaise + i.sgstPaise + i.igstPaise,
    0,
  );
  const cartDiscountPaise = 0;
  const beforeRoundOff = subtotalPaise - cartDiscountPaise + taxPaise;
  const totalPaise = Math.round(beforeRoundOff / 100) * 100;

  // ─── Checkout mutation ──────────────────────────────────────────
  const createSale = trpc.retail.createSale.useMutation({
    onSuccess: (result: unknown) => {
      const id = (result as { id?: string } | null)?.id;
      setFlash({ kind: 'success', msg: 'Sale created successfully' });
      setCartItems([]);
      setSelectedCustomer(null);
      setPaymentDialogOpen(false);
      if (id) {
        router.push(`/retail/sales/${id}`);
      }
    },
    onError: (err) => {
      setFlash({ kind: 'error', msg: err.message || 'Failed to create sale' });
    },
  });

  const handleCompleteSale = (
    payments: Array<{ method: string; amountPaise: number; reference?: string }>,
  ) => {
    if (!locationId) {
      setFlash({ kind: 'error', msg: 'Select a store / location before charging.' });
      return;
    }
    if (cartItems.length === 0) {
      setFlash({ kind: 'error', msg: 'Cart is empty.' });
      return;
    }

    createSale.mutate({
      customerId: selectedCustomer?.id,
      locationId,
      lineItems: cartItems.map((item) => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitPricePaise: item.unitPricePaise,
        discountPaise: item.discountPaise,
        metalRatePaise: item.metalRatePaise,
        metalWeightMg: item.metalWeightMg,
        makingChargesPaise: item.makingChargesPaise,
        wastageChargesPaise: item.wastageChargesPaise,
        hsnCode: item.hsnCode,
        gstRate: item.gstRate,
      })),
      payments: payments.map((p) => ({
        method: p.method as SalePaymentMethod,
        amountPaise: p.amountPaise,
        reference: p.reference,
      })),
      discountPaise: cartDiscountPaise,
      currencyCode: 'INR',
    });
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold">POS</h1>
          {ratesQuery.isLoading ? (
            <span className="hidden text-xs text-muted-foreground sm:block" role="status">
              Loading metal rates...
            </span>
          ) : ratesQuery.isError ? (
            <span className="hidden text-xs text-destructive sm:block" role="alert">
              Metal rates unavailable
              <button type="button" onClick={() => ratesQuery.refetch()} className="ml-2 underline">
                Retry
              </button>
            </span>
          ) : (
            <>
              {goldRate ? (
                <MetalRateDisplay
                  metalType="Gold 22K"
                  ratePaisePerGram={goldRate.ratePerGramPaise}
                  className="hidden sm:block"
                />
              ) : (
                <span className="hidden text-xs text-muted-foreground sm:block">No gold rate</span>
              )}
              {silverRate ? (
                <MetalRateDisplay
                  metalType="Silver"
                  ratePaisePerGram={silverRate.ratePerGramPaise}
                  className="hidden sm:block"
                />
              ) : (
                <span className="hidden text-xs text-muted-foreground sm:block">No silver rate</span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Location selector */}
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Store / location"
          >
            {branches.length === 0 && <option value="">No stores</option>}
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {branchLabels.get(b.id) ?? b.name}
              </option>
            ))}
          </select>

          {/* Customer picker */}
          {selectedCustomer ? (
            <button
              type="button"
              onClick={() => setSelectedCustomer(null)}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm"
            >
              <User className="h-3.5 w-3.5" />
              {selectedCustomer.name}
              <X className="ml-1 h-3 w-3" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCustomerPickerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            >
              <User className="h-3.5 w-3.5" />
              Walk-in
            </button>
          )}
        </div>
      </div>

      {/* Flash banner */}
      {flash && (
        <div
          className={`flex items-center gap-2 border-b px-4 py-2 text-sm ${
            flash.kind === 'error'
              ? 'bg-destructive/10 text-destructive'
              : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {flash.kind === 'error' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          <span className="flex-1">{flash.msg}</span>
          <button
            type="button"
            onClick={() => setFlash(null)}
            className="rounded hover:bg-black/5 p-0.5"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Product Search + Grid */}
        <div className="flex-1 space-y-4 overflow-auto p-4">
          {/* Live search input drives both dropdown (PosProductSearch) and grid below */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by SKU or name..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="h-12 w-full rounded-lg border bg-background pl-10 pr-4 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              autoComplete="off"
            />
          </div>

          {/* Dropdown-style quick pick (uses already-fetched products) */}
          <PosProductSearch products={products} onSelect={addToCart} />

          {/* Product Grid */}
          {productsQuery.isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading products...</div>
          ) : productsQuery.isError ? (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              Failed to load products: {productsQuery.error.message}
            </div>
          ) : products.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {debouncedProductSearch
                ? `No products found for "${debouncedProductSearch}"`
                : 'No stock available at this location.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addToCart(product)}
                  className="rounded-lg border p-3 text-left transition-all hover:border-primary hover:shadow-md"
                >
                  <div className="font-mono text-xs text-muted-foreground">{product.sku}</div>
                  <div className="mt-1 line-clamp-2 text-sm font-medium">{product.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{product.productType}</div>
                  <div className="mt-1 text-sm font-semibold text-primary">
                    {product.sellingPricePaise
                      ? `₹${(product.sellingPricePaise / 100).toLocaleString('en-IN')}`
                      : '—'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Cart */}
        <div className="flex w-96 flex-col border-l">
          <PosCart
            items={cartItems}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeItem}
            subtotalPaise={subtotalPaise}
            discountPaise={cartDiscountPaise}
            taxPaise={taxPaise}
            totalPaise={totalPaise}
          />

          {/* Action Buttons */}
          <div className="space-y-2 border-t p-3">
            <button
              type="button"
              onClick={() => setPaymentDialogOpen(true)}
              disabled={cartItems.length === 0 || !locationId || createSale.isPending}
              className="w-full rounded-md bg-primary py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <ShoppingCart className="mr-2 inline-block h-4 w-4" />
              {createSale.isPending
                ? 'Processing...'
                : `Charge ${totalPaise > 0 ? `₹${(totalPaise / 100).toLocaleString('en-IN')}` : ''}`}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCartItems([])}
                disabled={cartItems.length === 0}
                className="flex-1 rounded-md border py-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
              >
                Clear Cart
              </button>
              <button
                type="button"
                className="flex-1 rounded-md border py-2 text-xs font-medium hover:bg-accent"
              >
                <Printer className="mr-1 inline-block h-3 w-3" />
                Hold
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Picker Modal */}
      {customerPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24"
          onClick={() => setCustomerPickerOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-lg bg-background p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Select Customer</h3>
              <button
                type="button"
                onClick={() => setCustomerPickerOpen(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search name, phone, email..."
                className="h-10 w-full rounded-md border bg-background pl-10 pr-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="max-h-80 overflow-auto">
              <button
                type="button"
                onClick={() => {
                  setSelectedCustomer(null);
                  setCustomerPickerOpen(false);
                }}
                className="flex w-full items-center gap-2 border-b px-2 py-2 text-left text-sm hover:bg-accent"
              >
                <User className="h-4 w-4 text-muted-foreground" />
                <span>Walk-in customer (no record)</span>
              </button>
              {customersQuery.isLoading && (
                <div className="py-4 text-center text-xs text-muted-foreground">Loading...</div>
              )}
              {customersQuery.isError && (
                <div className="p-2 text-xs text-destructive">
                  {customersQuery.error.message}
                </div>
              )}
              {customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedCustomer({
                      id: c.id,
                      name: `${c.firstName} ${c.lastName}`.trim(),
                    });
                    setCustomerPickerOpen(false);
                  }}
                  className="flex w-full flex-col items-start px-2 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="font-medium">
                    {c.firstName} {c.lastName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.phone ?? c.email ?? '—'}
                  </span>
                </button>
              ))}
              {!customersQuery.isLoading && customers.length === 0 && (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  No customers found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Dialog */}
      <PosPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        totalPaise={totalPaise}
        onConfirm={handleCompleteSale}
        isProcessing={createSale.isPending}
        customerId={selectedCustomer?.id ?? null}
        errorMessage={createSale.isError ? createSale.error.message || 'Failed to create sale' : null}
      />
    </div>
  );
}
