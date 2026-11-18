/**
 * People + commerce planner. One ModulePlan made of:
 *
 *  - PAYROLL / ROLES / HARDWARE / CMS: self-contained (does not import plan-people.ts). DATE columns are stored
 *    at UTC midnight of the local calendar day, payslips are pro-rated so gross = basic + hra + allowances +
 *    overtime, the current month has a DRAFT run, and attendance never goes beyond yesterday. Role permissions
 *    live in Role.permissions JSON (no join table), resolved from ctx.permissionStrings. No user accounts.
 *  - E-COMMERCE: channels, gateway, marketplace catalog, 15 online orders (+items, payments, shipments,
 *    click & collect), reviews, wishlists, addresses, pre-orders (+configs), e-commerce notification templates.
 *  - COMPLIANCE / EXPORT: 8 hallmark submissions with items, 4 AML rules + 3 alerts, 2 export orders with invoices.
 *
 * Numbering is collision-safe against real documents: the API generators use count()+1 per month, so every
 * demo number lives in the 9001+ range of its sequence (ON/B2C/<yymm>/09001, ON/AMA/<yymm>/9001,
 * SH/<yymm>/9001, EXP/<TENANT4>/<yymm>/9001, EI|PI/<yymm>/9001) and hallmark submissions use HM-DEMO####
 * (the API uses HM-<base36 timestamp>). Real orders keep counting from 1 and cannot reach 9001.
 */
import {
  CITIES, Rng, Sequencer, addDays, bsum, daysAgoAt, eid, fakeAadhaar, fakeBankAccount, fakeIfsc, fakePan, pad, pickWeighted, randDigits, startOfDay, rateFactor, roundDiv, roundToRupee, rupees, yymm,
  type CustomerRef, type DemoContext, type ModulePlan, type ProductInfo, type Row, type TablePlan,
} from './common';
import type { DemoCustomer } from './plan-crm';
import { DEFAULT_PERMISSIONS } from '../permission-catalog';
import { priceLine, type RetailResult } from './plan-retail';

export const PEOPLE_COMMERCE_COUNTS = {
  // payroll + platform + cms are produced by plan-people.ts; counts below are what this planner guarantees
  employee: 12,
  payrollPeriod: 3, // PAID, PROCESSED, current month DRAFT (12 payslips each)
  salesChannel: 2,
  paymentGateway: 1,
  catalogItem: 'one per product (marketplace)',
  onlineOrder: 15,
  shipment: 8,
  clickAndCollect: 3,
  productReview: 8,
  wishlist: 10,
  preOrder: 3,
  preOrderConfig: 3,
  hallmarkSubmission: 8,
  amlRule: 4,
  amlAlert: 3,
  exportOrder: 2,
  exportInvoice: 2,
  notificationTemplate: 4,
  role: 4,
  hardwareDevice: 3,
  hardwareLabelTemplate: 2,
  blogPost: 6,
  page: 3,
  announcement: 3,
} as const;


/** DATE-ONLY value: UTC midnight of the LOCAL calendar day (never the previous day). */
export function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

const clampNow = (ctx: DemoContext, d: Date): Date => (d.getTime() > ctx.now.getTime() ? new Date(ctx.now.getTime() - 60_000) : d);
const plusMin = (ctx: DemoContext, d: Date, min: number): Date => clampNow(ctx, new Date(d.getTime() + min * 60_000));

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function alnum(rng: Rng, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += ALNUM[rng.int(0, ALNUM.length - 1)];
  return s;
}
const digits = (rng: Rng, n: number): string => Array.from({ length: n }, () => rng.int(0, 9)).join('');


// ─── Payroll ───────────────────────────────────────────────────────
// Own implementation (no dependency on plan-people.ts). Same statutory rules as PayrollSalaryService.computeSalary.

interface Pay {
  basicSalary: bigint; hra: bigint; allowances: [bigint, bigint, bigint, bigint]; grossSalary: bigint; pf: bigint; esi: bigint; pt: bigint; tds: bigint; overtimePay: bigint;
}

function computePay(e: { basic: bigint; hra: bigint; da: bigint; conv: bigint; med: bigint; other: bigint }, workDays: number, presentDays: number, ot: number): Pay {
  const ratio = workDays > 0 ? presentDays / workDays : 0;
  const pr = (a: bigint): bigint => (ratio >= 1 ? a : BigInt(Math.round(Number(a) * ratio)));
  const basicSalary = pr(e.basic);
  const hra = pr(e.hra);
  const allowances: [bigint, bigint, bigint, bigint] = [pr(e.da), pr(e.conv), pr(e.med), pr(e.other)];
  const overtimePay = ot > 0 ? BigInt(Math.round((Number(e.basic) / 240) * 2 * ot)) : 0n;
  const grossSalary = basicSalary + hra + bsum(allowances) + overtimePay;
  const pf = BigInt(Math.round(Number(basicSalary) * 0.12));
  const esi = grossSalary <= 2_100_000n ? BigInt(Math.round(Number(grossSalary) * 0.0075)) : 0n;
  const pt = grossSalary > 1_500_000n ? 20_000n : 0n;
  const annual = grossSalary * 12n;
  const tds = annual > 25_000_000n ? BigInt(Math.round(Number(annual - 25_000_000n) * 0.1)) / 12n : 0n;
  return { basicSalary, hra, allowances, grossSalary, pf, esi, pt, tds, overtimePay };
}

const EMPLOYEES: Array<{ first: string; last: string; designation: string; department: string; gross: number; female: boolean }> = [
  { first: 'Rajesh', last: 'Kulkarni', designation: 'Store Manager', department: 'Sales', gross: 52000, female: false },
  { first: 'Sunita', last: 'Deshmukh', designation: 'Accountant', department: 'Accounts', gross: 36000, female: true },
  { first: 'Amit', last: 'Patil', designation: 'Sales Executive', department: 'Sales', gross: 24000, female: false },
  { first: 'Pooja', last: 'Naik', designation: 'Sales Executive', department: 'Sales', gross: 23000, female: true },
  { first: 'Farhan', last: 'Shaikh', designation: 'Sales Executive', department: 'Sales', gross: 22000, female: false },
  { first: 'Kavita', last: 'Joshi', designation: 'Cashier', department: 'Accounts', gross: 19500, female: true },
  { first: 'Mahesh', last: 'Gawde', designation: 'Workshop Supervisor', department: 'Workshop', gross: 41000, female: false },
  { first: 'Santosh', last: 'Jadhav', designation: 'Goldsmith', department: 'Workshop', gross: 21000, female: false },
  { first: 'Ramesh', last: 'Yadav', designation: 'Security Guard', department: 'Admin', gross: 15500, female: false },
  { first: 'Neelam', last: 'Pawar', designation: 'Digital Marketing Executive', department: 'E-commerce', gross: 28000, female: true },
  { first: 'Vinod', last: 'Chauhan', designation: 'Store Helper', department: 'Store', gross: 16000, female: false },
  { first: 'Priya', last: 'Menon', designation: 'HR and Admin Executive', department: 'Admin', gross: 30000, female: true },
];
const NATIONAL_HOLIDAYS = new Set(['1-26', '5-1', '8-15', '10-2', '12-25', '4-14']);
const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

function planPayrollTables(ctx: DemoContext): TablePlan[] {
  const rng = new Rng(`${ctx.tenantId}:people-payroll`);
  const { now } = ctx;
  const t: Record<string, Row[]> = {};
  const add = (m: string, r: Row) => (t[m] ??= []).push(r);

  const emps = EMPLOYEES.map((d, i) => {
    const gross = rupees(d.gross);
    const basic = rupees(Math.round(d.gross * 0.5));
    const hra = rupees(Math.round(d.gross * 0.2));
    const da = rupees(Math.round(d.gross * 0.1));
    const conv = rupees(1600);
    const med = rupees(1250);
    const other = gross - basic - hra - da - conv - med;
    const city = CITIES[i % 3]!;
    const id = eid(ctx, 'pc-employee', i);
    add('employee', {
      id, tenantId: ctx.tenantId, userId: null, employeeCode: `EMP-D${pad(i + 1, 3)}`, firstName: d.first, lastName: d.last,
      dob: new Date(Date.UTC(1978 + ((i * 3) % 20), (i * 5) % 12, 3 + ((i * 7) % 24))), gender: d.female ? 'FEMALE' : 'MALE', joinedAt: dateOnly(daysAgoAt(now, 420 + i * 130, 9)),
      designation: d.designation, department: d.department, branchId: d.department === 'Workshop' ? ctx.workshop.id : ctx.showroom.id, basicSalaryPaise: basic, hraPaise: hra, daPaise: da,
      conveyancePaise: conv, medicalPaise: med, otherAllowancePaise: other, panNumber: fakePan(rng, 'P', d.last.charAt(0)), aadhaarNumber: fakeAadhaar(rng),
      pfNumber: `MH/BAN/${randDigits(rng, 7)}/000/${randDigits(rng, 7)}`, esiNumber: d.gross <= 21000 ? randDigits(rng, 17) : null, bankAccountNumber: fakeBankAccount(rng),
      bankIfsc: fakeIfsc(rng, city.ifscPrefix), bankName: city.bank, status: 'ACTIVE', createdAt: dateOnly(daysAgoAt(now, 420 + i * 130, 9)),
    });
    add('salaryStructure', {
      id: eid(ctx, 'pc-salary-structure', i), tenantId: ctx.tenantId, employeeId: id, designation: d.designation, branchId: d.department === 'Workshop' ? ctx.workshop.id : ctx.showroom.id,
      name: `${d.designation} package`, basicPercent: 50, hraPercent: 20, daPercent: 10, conveyancePaise: conv, medicalPaise: med, otherAllowancePaise: other,
      effectiveFrom: dateOnly(daysAgoAt(now, 420 + i * 130, 9)), createdAt: daysAgoAt(now, 420 + i * 130, 9),
    });
    return { id, basic, hra, da, conv, med, other, department: d.department };
  });
  (['Sales Executive', 'Goldsmith', 'Management grade'] as const).forEach((des, i) => add('salaryStructure', {
    id: eid(ctx, 'pc-salary-template', i), tenantId: ctx.tenantId, employeeId: null, designation: des, name: `${des} standard template`, basicPercent: 50, hraPercent: 20, daPercent: 10,
    conveyancePaise: rupees(1600), medicalPaise: rupees(1250), otherAllowancePaise: 0n, effectiveFrom: dateOnly(daysAgoAt(now, 365, 9)), createdAt: daysAgoAt(now, 365, 9),
  }));

  // attendance rows: from 60 days back (or the start of last month if earlier) to yesterday
  const today0 = startOfDay(now);
  const lastMonth0 = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const startOffset = Math.max(60, Math.round((today0.getTime() - lastMonth0.getTime()) / 86_400_000));
  const rec = new Map<string, { status: string; ot: number }>();
  emps.forEach((e, ei) => {
    for (let n = startOffset; n >= 1; n--) {
      const local = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);
      const date = dateOnly(local);
      let status: string;
      if (local.getDay() === 0) status = 'WEEKLY_OFF';
      else if (NATIONAL_HOLIDAYS.has(`${local.getMonth() + 1}-${local.getDate()}`)) status = 'HOLIDAY';
      else {
        const r = rng.float();
        status = r < 0.025 ? 'ABSENT' : r < 0.06 ? 'HALF_DAY' : r < 0.1 ? 'PAID_LEAVE' : r < 0.11 ? 'UNPAID_LEAVE' : 'PRESENT';
      }
      const worked = status === 'PRESENT' || status === 'HALF_DAY';
      const ot = status === 'PRESENT' && e.department !== 'Accounts' && rng.chance(0.1) ? rng.pick([0.5, 1, 1.5, 2]) : 0;
      const hours = status === 'HALF_DAY' ? 4.5 : worked ? 9 + ot : 0;
      const checkIn = worked ? new Date(local.getFullYear(), local.getMonth(), local.getDate(), 9, 30 + rng.int(-10, 45)) : null;
      rec.set(`${ei}|${isoDay(date)}`, { status, ot });
      add('employeeAttendance', {
        id: eid(ctx, 'pc-attendance', `${ei}-${isoDay(date)}`), tenantId: ctx.tenantId, employeeId: e.id, date, status, checkInTime: checkIn,
        checkOutTime: checkIn ? new Date(checkIn.getTime() + hours * 3_600_000) : null, hoursWorked: hours, overtimeHours: ot,
        source: e.department === 'Workshop' || e.department === 'Store' ? 'BIOMETRIC' : e.department === 'Sales' && ei % 2 === 0 ? 'MOBILE' : 'MANUAL',
        createdAt: clampNow(ctx, new Date(local.getFullYear(), local.getMonth(), local.getDate(), 20)),
      });
    }
  });

  // payroll periods: month-2 PAID, month-1 PROCESSED, current month DRAFT
  const yesterdayIso = isoDay(dateOnly(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)));
  const advances = new Map<number, bigint>([[7, rupees(2000)], [10, rupees(1500)]]);
  for (const back of [2, 1, 0]) {
    const first = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const y = first.getFullYear();
    const m = first.getMonth();
    const label = `${y}-${String(m + 1).padStart(2, '0')}`;
    const periodId = eid(ctx, 'pc-payroll-period', label);
    const status = back === 2 ? 'PAID' : back === 1 ? 'PROCESSED' : 'DRAFT';
    const nextFirst = new Date(y, m + 1, 1);
    const processedAt = status === 'DRAFT' ? null : clampNow(ctx, new Date(nextFirst.getFullYear(), nextFirst.getMonth(), nextFirst.getDate() + 1, 11));
    add('payrollPeriod', {
      id: periodId, tenantId: ctx.tenantId, periodLabel: label, startDate: new Date(Date.UTC(y, m, 1)), endDate: new Date(Date.UTC(y, m + 1, 0)), status, processedAt,
      processedBy: processedAt ? ctx.adminUserId : null, createdAt: clampNow(ctx, new Date(y, m, 1, 9)),
    });
    const days = new Date(y, m + 1, 0).getDate();
    emps.forEach((e, ei) => {
      let workDays = 0;
      let present = 0;
      let leave = 0;
      let off = 0;
      let ot = 0;
      for (let d = 1; d <= days; d++) {
        const key = isoDay(new Date(Date.UTC(y, m, d)));
        if (back === 0 && key > yesterdayIso) break;
        const r = rec.get(`${ei}|${key}`);
        const local = new Date(y, m, d);
        const dayStatus = r?.status ?? (local.getDay() === 0 ? 'WEEKLY_OFF' : 'PRESENT');
        workDays++;
        ot += r?.ot ?? 0;
        if (dayStatus === 'PRESENT') present += 1;
        else if (dayStatus === 'HALF_DAY') present += 0.5;
        else if (dayStatus === 'PAID_LEAVE') leave += 1;
        else if (dayStatus === 'WEEKLY_OFF' || dayStatus === 'HOLIDAY') off += 1;
      }
      if (workDays === 0) return;
      const presentDays = present + leave + off;
      const c = computePay(e, workDays, presentDays, ot);
      const adv = back <= (ei === 7 ? 2 : 1) ? (advances.get(ei) ?? 0n) : 0n;
      const totalDeductions = c.pf + c.esi + c.tds + c.pt + adv;
      add('payslip', {
        id: eid(ctx, 'pc-payslip', `${label}-${ei}`), tenantId: ctx.tenantId, employeeId: e.id, payrollPeriodId: periodId, basicSalary: c.basicSalary, hra: c.hra,
        allowances: { da: Number(c.allowances[0]), conveyance: Number(c.allowances[1]), medical: Number(c.allowances[2]), other: Number(c.allowances[3]) }, grossSalary: c.grossSalary,
        pfDeduction: c.pf, esiDeduction: c.esi, tdsDeduction: c.tds, professionalTax: c.pt, otherDeductions: adv > 0n ? { advanceRecovery: Number(adv) } : {}, totalDeductions,
        netSalary: c.grossSalary - totalDeductions, workDays, presentDays: Math.floor(presentDays), leaveDays: leave, overtimeHours: ot, overtimePay: c.overtimePay,
        status: status === 'PAID' ? 'PAID' : status === 'PROCESSED' ? 'APPROVED' : 'DRAFT',
        paidAt: status === 'PAID' ? clampNow(ctx, new Date(nextFirst.getFullYear(), nextFirst.getMonth(), nextFirst.getDate() + 2, 15)) : null,
        createdAt: processedAt ?? clampNow(ctx, daysAgoAt(now, 0, 8)),
      });
    });
  }
  return ['employee', 'salaryStructure', 'employeeAttendance', 'payrollPeriod', 'payslip'].filter((m) => t[m]).map((m) => ({ model: m, rows: t[m]! }));
}

// ─── Roles, hardware, CMS ──────────────────────────────────────────
// Roles keep permissions as a JSON map {"module.resource": [actions]} on the role row (there is no join
// table), so the subsets are resolved at plan time from ctx.permissionStrings (catalog fallback). Never the Admin role.

const ROLE_DEFS: Array<{ name: string; description: string; prefixes: string[] }> = [
  { name: 'Sales Manager', description: 'Runs the sales floor, customers and campaigns', prefixes: ['retail.', 'crm.', 'inventory.item.read', 'inventory.stock.read', 'reporting.', 'ecommerce.order.read'] },
  { name: 'Accountant', description: 'Invoices, payments, ledger and GST reports', prefixes: ['financial.', 'reporting.', 'wholesale.purchase.read', 'wholesale.supplier.read', 'retail.sale.read'] },
  { name: 'Store Staff', description: 'Point of sale, repairs and customer records', prefixes: ['retail.sale.create', 'retail.sale.read', 'retail.repair.', 'retail.return.read', 'crm.customer.create', 'crm.customer.read', 'crm.customer.update', 'inventory.item.read', 'inventory.stock.read'] },
  { name: 'Karigar Supervisor', description: 'Workshop jobs, BOMs, karigars and metal ledger', prefixes: ['manufacturing.', 'inventory.metal.read', 'inventory.item.read', 'inventory.stock.read'] },
];

export function rolePermissionJson(all: readonly string[], prefixes: readonly string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const perm of all) {
    if (!prefixes.some((p) => perm.startsWith(p))) continue;
    const parts = perm.split('.');
    if (parts.length < 3) continue;
    const bucket = (out[parts.slice(0, -1).join('.')] ??= []);
    const action = parts[parts.length - 1]!;
    if (!bucket.includes(action)) bucket.push(action);
  }
  return out;
}

function planPlatformTables(ctx: DemoContext): TablePlan[] {
  const { now } = ctx;
  const admin = ctx.adminUserId;
  const t: Record<string, Row[]> = {};
  const add = (m: string, r: Row) => (t[m] ??= []).push(r);
  const all = ctx.permissionStrings.length > 0 ? ctx.permissionStrings : DEFAULT_PERMISSIONS.map((p) => `${p.module}.${p.resource}.${p.action}`);
  ROLE_DEFS.forEach((r, i) => add('role', {
    id: eid(ctx, 'pc-role', i), tenantId: ctx.tenantId, name: r.name, description: r.description, permissions: rolePermissionJson(all, r.prefixes), isSystem: false, createdAt: daysAgoAt(now, 95, 10), createdBy: admin,
  }));
  const devices: Array<{ row: Row; seen: [number, number] }> = [
    { seen: [0, 9], row: { name: 'Counter barcode scanner', deviceType: 'BARCODE_SCANNER', connectionType: 'USB_HID', vendorId: '05e0', productId: '1200', settings: { suffix: 'ENTER' }, status: 'CONNECTED', locationId: ctx.showroom.id } },
    { seen: [0, 9], row: { name: 'Tag label printer', deviceType: 'LABEL_PRINTER', connectionType: 'NETWORK_TCP', ipAddress: '192.168.1.50', tcpPort: 9100, settings: { dpi: 203, language: 'ZPL' }, status: 'CONNECTED', locationId: ctx.showroom.id } },
    { seen: [2, 17], row: { name: 'Warehouse RFID reader', deviceType: 'RFID_READER', connectionType: 'NETWORK_TCP', ipAddress: '192.168.1.60', tcpPort: 4001, settings: { power: 20 }, status: 'DISCONNECTED', locationId: ctx.warehouse.id } },
    { seen: [0, 9], row: { name: 'Counter precision scale', deviceType: 'WEIGHING_SCALE', connectionType: 'USB_SERIAL', port: 'COM3', baudRate: 9600, settings: { unit: 'g', precision: 3 }, status: 'CONNECTED', locationId: ctx.showroom.id } },
  ];
  devices.forEach((d, i) => add('hardwareDevice', {
    id: eid(ctx, 'pc-hardware', i), tenantId: ctx.tenantId, isActive: true, lastSeenAt: daysAgoAt(now, d.seen[0], d.seen[1]), createdAt: daysAgoAt(now, 80, 10), createdBy: admin, ...d.row,
  }));
  add('hardwareLabelTemplate', {
    id: eid(ctx, 'pc-label', 0), tenantId: ctx.tenantId, name: 'Jewellery tag 50x15', width: 50, height: 15, createdAt: daysAgoAt(now, 80, 10), createdBy: admin,
    fields: [
      { type: 'text', x: 2, y: 2, width: 30, height: 4, value: '{{sku}}', fontSize: 8 },
      { type: 'text', x: 2, y: 8, width: 26, height: 4, value: 'Net {{netWeight}} g', fontSize: 8 },
      { type: 'text', x: 30, y: 8, width: 18, height: 4, value: 'HUID {{huid}}', fontSize: 8 },
      { type: 'barcode', x: 32, y: 1, width: 16, height: 6, value: '{{sku}}', barcodeType: 'CODE128' },
    ],
  });
  add('hardwareLabelTemplate', {
    id: eid(ctx, 'pc-label', 1), tenantId: ctx.tenantId, name: 'Price tag 40x25', width: 40, height: 25, createdAt: daysAgoAt(now, 80, 10), createdBy: admin,
    fields: [
      { type: 'text', x: 2, y: 2, width: 36, height: 5, value: '{{name}}', fontSize: 9 },
      { type: 'text', x: 2, y: 9, width: 36, height: 6, value: 'Rs {{price}}', fontSize: 12 },
      { type: 'barcode', x: 2, y: 16, width: 36, height: 7, value: '{{sku}}', barcodeType: 'CODE128' },
    ],
  });
  return ['role', 'hardwareDevice', 'hardwareLabelTemplate'].filter((m) => t[m]).map((m) => ({ model: m, rows: t[m]! }));
}

function planCmsTables(ctx: DemoContext): TablePlan[] {
  const { now } = ctx;
  const admin = ctx.adminUserId;
  const t: Record<string, Row[]> = {};
  const add = (m: string, r: Row) => (t[m] ??= []).push(r);
  const pages: Array<[string, string, string]> = [
    ['Shipping and Delivery Policy', 'shipping-and-delivery-policy', 'All orders ship fully insured within 2 business days. Delivery takes 3 to 6 days across India and a signature plus ID check is required on receipt.'],
    ['Returns and Exchange Policy', 'returns-and-exchange-policy', 'Unused jewellery can be returned or exchanged within 7 days with the original invoice and hallmark tag intact. Custom orders are not returnable.'],
    ['Jewellery Care Guide', 'jewellery-care-guide', 'Store pieces separately in soft pouches, avoid perfume and water contact, and bring them for a free polish every six months.'],
  ];
  pages.forEach(([title, slug, body], i) => add('page', {
    id: eid(ctx, 'pc-page', i), tenantId: ctx.tenantId, title, slug, content: `<h1>${title}</h1><p>${body}</p>`, metaTitle: title, metaDescription: body.slice(0, 150), isPublished: true,
    publishedAt: daysAgoAt(now, 45 - i * 8, 10), createdAt: daysAgoAt(now, 46 - i * 8, 10), createdBy: admin,
  }));
  const posts: Array<[string, string, string, string]> = [
    ['Storing your gold jewellery safely', 'storing-your-gold-jewellery-safely', 'Care Tips', 'Keep pieces apart so harder stones do not scratch softer metal, and use anti-tarnish pouches for silver.'],
    ['What is a HUID and why it matters', 'what-is-a-huid-and-why-it-matters', 'Compliance', 'Every hallmarked piece carries a six character alphanumeric HUID that you can verify against the BIS record.'],
    ['Making charges explained', 'gold-making-charges-explained', 'Guides', 'Making charges cover design, labour and finishing. Compare them as a percentage of the metal value, not only per gram.'],
    ['A wedding jewellery checklist', 'wedding-jewellery-checklist', 'Guides', 'Plan the necklace set, bangles, earrings and maang tikka together so the weights and designs complement each other.'],
    ['Silver jewellery polish tips', 'silver-jewellery-polish-tips', 'Care Tips', 'A soft cloth and a mild solution restore shine. Avoid toothpaste, which is abrasive and wears down fine detailing.'],
    ['Gold rates and when to buy', 'gold-rate-and-when-to-buy', 'Trends', 'Rates move daily with global prices and the rupee. Our scheme lets you accumulate gold in instalments instead of timing the market.'],
  ];
  posts.forEach(([title, slug, tag, body], i) => add('blogPost', {
    id: eid(ctx, 'pc-blog', i), tenantId: ctx.tenantId, title, slug, excerpt: body, content: `<p>${body}</p><p>${body}</p><p>Visit the showroom or chat with us for a personal recommendation.</p>`, coverImageUrl: null,
    author: i % 2 === 0 ? 'Editorial Team' : 'Store Manager', categoryTag: tag, tags: ['jewellery', tag.toLowerCase().replace(' ', '-')], readTimeMinutes: 3 + (i % 4), isPublished: true,
    publishedAt: daysAgoAt(now, 6 + i * 12, 10), viewCount: 90 + i * 57, createdAt: daysAgoAt(now, 7 + i * 12, 10), createdBy: admin,
  }));
  const ann: Array<[string, string, boolean, number, number]> = [
    ['Free insured shipping on orders above Rs 25,000', '#7c5a1e', true, 12, 40],
    ['Every piece is BIS hallmarked with a HUID', '#1f4d3a', true, 30, 90],
    ['Weekend gold exchange camp has ended. Thank you for visiting', '#5a5a5a', false, 40, -10],
  ];
  ann.forEach(([message, bg, active, startAgo, endIn], i) => add('announcement', {
    id: eid(ctx, 'pc-announcement', i), tenantId: ctx.tenantId, message, linkUrl: '/offers', linkText: 'Know more', backgroundColor: bg, textColor: '#ffffff', isActive: active,
    startDate: daysAgoAt(now, startAgo, 9), endDate: addDays(now, endIn), createdAt: daysAgoAt(now, startAgo, 9), createdBy: admin,
  }));
  posts.slice(0, 3).forEach(([title, slug, , body], i) => add('seoMetadata', {
    id: eid(ctx, 'pc-seo', `blog-${i}`), tenantId: ctx.tenantId, pageType: 'BLOG', pageIdentifier: slug, metaTitle: title, metaDescription: body.slice(0, 150), createdAt: daysAgoAt(now, 20, 10), createdBy: admin,
  }));
  ctx.products.slice(0, 3).forEach((p, i) => add('seoMetadata', {
    id: eid(ctx, 'pc-seo', `product-${i}`), tenantId: ctx.tenantId, pageType: 'PRODUCT', pageIdentifier: p.id, metaTitle: `${p.name} | Buy online`, metaDescription: `${p.name} (${p.sku}). BIS hallmarked, insured delivery and easy exchange.`,
    structuredData: { '@type': 'Product', name: p.name, sku: p.sku }, createdAt: daysAgoAt(now, 20, 10), createdBy: admin,
  }));
  return ['page', 'blogPost', 'announcement', 'seoMetadata'].filter((m) => t[m]).map((m) => ({ model: m, rows: t[m]! }));
}

// ─── Main ──────────────────────────────────────────────────────────

type OnlineStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED';

interface Slot {
  status: OnlineStatus;
  ch: 'WEB' | 'MKT';
  pay: 'UPI' | 'CARD' | 'NETBANKING' | 'COD' | 'PREPAID';
  days: [number, number];
  items: 1 | 2;
  cc?: 'READY_FOR_PICKUP' | 'NOTIFIED' | 'PICKED_UP';
  ship?: 'LABEL_CREATED' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
  coupon?: boolean;
}

const SLOTS: Slot[] = [
  { status: 'DELIVERED', ch: 'WEB', pay: 'UPI', days: [40, 70], items: 1, ship: 'DELIVERED', coupon: true },
  { status: 'DELIVERED', ch: 'WEB', pay: 'CARD', days: [25, 55], items: 2, ship: 'DELIVERED' },
  { status: 'DELIVERED', ch: 'WEB', pay: 'COD', days: [14, 40], items: 1, ship: 'DELIVERED' },
  { status: 'DELIVERED', ch: 'MKT', pay: 'PREPAID', days: [18, 45], items: 1, ship: 'DELIVERED' },
  { status: 'DELIVERED', ch: 'WEB', pay: 'UPI', days: [12, 30], items: 1, cc: 'PICKED_UP', coupon: true },
  { status: 'SHIPPED', ch: 'WEB', pay: 'CARD', days: [3, 5], items: 1, ship: 'OUT_FOR_DELIVERY' },
  { status: 'SHIPPED', ch: 'MKT', pay: 'PREPAID', days: [3, 6], items: 1, ship: 'IN_TRANSIT' },
  { status: 'PROCESSING', ch: 'WEB', pay: 'UPI', days: [2, 4], items: 2, ship: 'LABEL_CREATED' },
  { status: 'PROCESSING', ch: 'WEB', pay: 'NETBANKING', days: [2, 4], items: 1, cc: 'READY_FOR_PICKUP' },
  { status: 'PROCESSING', ch: 'WEB', pay: 'COD', days: [2, 5], items: 1, cc: 'NOTIFIED' },
  { status: 'CONFIRMED', ch: 'MKT', pay: 'PREPAID', days: [1, 3], items: 1 },
  { status: 'RETURNED', ch: 'WEB', pay: 'UPI', days: [28, 50], items: 1, ship: 'DELIVERED' },
  { status: 'PENDING', ch: 'WEB', pay: 'COD', days: [0, 1], items: 1 },
  { status: 'PENDING', ch: 'WEB', pay: 'UPI', days: [0, 1], items: 1 },
  { status: 'CANCELLED', ch: 'WEB', pay: 'CARD', days: [8, 25], items: 1 },
];

const CARRIERS = ['SwiftShip Logistics', 'RoadRunner Express', 'SecureTrans Insured Cargo'];
const ADDRESS_LINES = ['Flat 4B, Sunrise Apartments, MG Road', '12, Lakeview Society, Station Road', '7/3, Green Park Colony', 'Plot 21, Shanti Nagar', '304, Orchid Heights, Link Road', '18, Temple Street, Old Town'];
const REVIEW_TEXT: Array<[number, string, string]> = [
  [5, 'Beautiful finish', 'The piece looks exactly like the photos. Hallmark and HUID verified on the app.'],
  [5, 'Perfect gift', 'Packaging was elegant and insured delivery arrived on time. Highly recommended.'],
  [4, 'Good value', 'Making charges were reasonable and the weight matches the invoice.'],
  [5, 'Lovely design', 'Lightweight and comfortable for daily wear. Got many compliments.'],
  [4, 'Nice but slightly delayed', 'Product is great, courier took an extra day. Customer support was helpful.'],
  [3, 'Okay', 'Design is good but the size ran slightly small; exchange was arranged quickly.'],
  [5, 'Worth every rupee', 'Sparkle and craftsmanship are excellent for the price.'],
  [4, 'Elegant', 'Classic look, good packaging, would buy again.'],
];

export function planPeopleCommerce(ctx: DemoContext, customers: DemoCustomer[], retail: RetailResult): ModulePlan {
  const { now } = ctx;
  const admin = ctx.adminUserId;
  const rng = new Rng(`${ctx.tenantId}:people-commerce`);
  const t: Record<string, Row[]> = {};
  const add = (m: string, r: Row) => (t[m] ??= []).push(r);

  // ═══ E-COMMERCE ═══════════════════════════════════════════════════
  const webId = eid(ctx, 'channel', 'web');
  const mktId = eid(ctx, 'channel', 'marketplace');
  const gatewayId = eid(ctx, 'gateway', 'razorpay-test');
  add('salesChannel', {
    id: webId, tenantId: ctx.tenantId, name: 'Jewellery Website', channelType: 'WEBSITE', storeUrl: 'https://shop.example.com', settings: { demo: true, currency: 'INR' },
    isActive: true, lastSyncAt: daysAgoAt(now, 0, 7), createdAt: daysAgoAt(now, 100, 10), createdBy: admin,
  });
  add('salesChannel', {
    id: mktId, tenantId: ctx.tenantId, name: 'Online Marketplace Store', channelType: 'AMAZON', storeUrl: 'https://marketplace.example.com/store/demo-jewellers',
    settings: { demo: true, fulfilment: 'SELF' }, isActive: true, lastSyncAt: daysAgoAt(now, 0, 6), createdAt: daysAgoAt(now, 95, 10), createdBy: admin,
  });
  add('paymentGateway', {
    id: gatewayId, tenantId: ctx.tenantId, name: 'Razorpay (Test mode)', gatewayType: 'RAZORPAY', isActive: true, isDefault: true,
    supportedMethods: ['UPI', 'CARD', 'NETBANKING', 'COD'], settings: { mode: 'test' }, createdAt: daysAgoAt(now, 100, 10), createdBy: admin,
  });

  const listUnit = (p: ProductInfo, daysBack: number): bigint => {
    const u = priceLine(p, rateFactor(daysBack), 1, null).unitPricePaise;
    return u + roundDiv(u * 3n, 100n); // storefront prices include 3% GST
  };

  // marketplace catalog: every product, a couple out of sync
  ctx.products.forEach((p, i) => {
    const price = listUnit(p, 0);
    const failed = i % 13 === 7;
    const stale = i % 9 === 4;
    add('catalogItem', {
      id: eid(ctx, 'catalog-item', p.id), tenantId: ctx.tenantId, productId: p.id, channelId: mktId, externalProductId: `MP-${alnum(new Rng(`${ctx.tenantId}:mp:${p.id}`), 8)}`,
      title: p.name, description: `${p.name} (${p.sku})`, pricePaise: price, comparePricePaise: roundToRupee((price * 108n) / 100n), currencyCode: 'INR', images: [],
      status: 'ACTIVE', syncStatus: failed ? 'FAILED' : stale ? 'OUT_OF_SYNC' : 'SYNCED', lastSyncAt: daysAgoAt(now, failed ? 3 : 0, 6),
      syncError: failed ? 'Marketplace rejected the listing: image resolution too low' : null, createdAt: daysAgoAt(now, 90, 11), createdBy: admin,
    });
  });
  const catalogIdOf = (pid: string): string => eid(ctx, 'catalog-item', pid);

  // stock available online (retail already consumed some showroom stock)
  const avail = new Map<string, number>();
  for (const p of ctx.products) avail.set(p.id, p.qty0);
  for (const m of retail.stockMoves) if (m.where === 'showroom') avail.set(m.productId, (avail.get(m.productId) ?? 0) + m.delta);
  const eligible = ctx.products.filter((p) => p.showroomStockId && p.qty0 >= 2);
  const takeProduct = (exclude: Set<string>): ProductInfo => {
    const pool = eligible.filter((p) => (avail.get(p.id) ?? 0) >= 2 && !exclude.has(p.id));
    const src = pool.length > 0 ? pool : eligible;
    const p = pickWeighted(rng, src.map((x) => [x, x.sellingPaise < 20_000_000n ? 3 : 1] as const));
    avail.set(p.id, (avail.get(p.id) ?? 0) - 1);
    return p;
  };

  // customers for orders: distinct where possible, CRM retail customers first
  const pool: DemoCustomer[] = [...customers.filter((c) => c.type === 'RETAIL'), ...customers.filter((c) => c.type !== 'RETAIL')];
  const refPool: CustomerRef[] = ctx.existingCustomers;
  const buyerFor = (i: number): { id: string; first: string; last: string; email: string | null; phone: string | null; city: string; state: string; pin: string } => {
    const c = pool[i % Math.max(1, pool.length)];
    if (c) return { id: c.id, first: c.firstName, last: c.lastName, email: c.email, phone: c.phone, city: c.city.city, state: c.city.state, pin: c.city.pin };
    const r = refPool[i % refPool.length]!;
    return { id: r.id, first: r.firstName, last: r.lastName, email: null, phone: r.phone, city: r.city || ctx.showroom.city, state: r.state || ctx.showroom.state, pin: '400001' };
  };

  interface Built {
    slot: Slot; idx: number; id: string; placedAt: Date; confirmedAt: Date | null; shippedAt: Date | null; deliveredAt: Date | null;
    buyer: ReturnType<typeof buyerFor>; lines: Array<{ p: ProductInfo; unit: bigint }>; subtotal: bigint; discount: bigint; total: bigint;
  }
  const built: Built[] = SLOTS.map((slot, idx) => {
    const daysBack = rng.int(slot.days[0], slot.days[1]);
    const placedAt = daysAgoAt(now, daysBack, rng.int(9, 22), rng.int(0, 59));
    const used = new Set<string>();
    const lines = Array.from({ length: slot.items }, () => {
      const p = takeProduct(used);
      used.add(p.id);
      return { p, unit: listUnit(p, daysBack) };
    });
    const subtotal = bsum(lines.map((l) => l.unit));
    const discount = slot.coupon ? roundToRupee((subtotal * 5n) / 100n) : 0n;
    const confirmed = slot.status === 'PENDING' ? null : plusMin(ctx, placedAt, rng.int(15, 90));
    const shippedAt = slot.ship || slot.status === 'SHIPPED' ? plusMin(ctx, placedAt, 24 * 60 + rng.int(60, 360)) : null;
    let deliveredAt: Date | null = null;
    if (slot.ship === 'DELIVERED') deliveredAt = plusMin(ctx, shippedAt!, (2 + rng.int(0, 2)) * 24 * 60 + rng.int(0, 300));
    if (slot.cc === 'PICKED_UP') deliveredAt = plusMin(ctx, placedAt, (1 + rng.int(0, 1)) * 24 * 60 + rng.int(60, 300));
    return { slot, idx, id: eid(ctx, 'online-order', idx), placedAt, confirmedAt: confirmed, shippedAt: slot.ship === 'LABEL_CREATED' ? null : shippedAt, deliveredAt, buyer: buyerFor(idx), lines, subtotal, discount, total: subtotal - discount };
  });

  // order numbers in chronological order per channel and month, demo range (9001+)
  const seqs = new Sequencer();
  const numberOf = new Map<string, string>();
  [...built].sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime()).forEach((o) => {
    const ym = yymm(o.placedAt);
    numberOf.set(o.id, o.slot.ch === 'WEB' ? `ON/B2C/${ym}/${pad(9000 + seqs.next(`B2C${ym}`), 5)}` : `ON/AMA/${ym}/${pad(9000 + seqs.next(`AMA${ym}`), 4)}`);
  });

  const shipSeq = new Sequencer();
  const addressesDone = new Set<string>();
  const stockRows: Row[] = [];
  const stockDeltas = new Map<string, number>();
  const orderRows: Array<{ o: Built; row: Row }> = [];
  let cc = 0;
  let ship = 0;
  const gcProducts: Array<{ order: Built; productId: string; buyerName: string }> = [];

  for (const o of built) {
    const { slot, buyer } = o;
    const number = numberOf.get(o.id)!;
    const address = {
      firstName: buyer.first, lastName: buyer.last, phone: buyer.phone, line1: ADDRESS_LINES[o.idx % ADDRESS_LINES.length], line2: null, city: buyer.city, state: buyer.state, country: 'IN', postalCode: buyer.pin,
    };
    if (!addressesDone.has(buyer.id)) {
      addressesDone.add(buyer.id);
      add('customerAddress', {
        id: eid(ctx, 'customer-address', buyer.id), tenantId: ctx.tenantId, customerId: buyer.id, label: 'Home', firstName: buyer.first, lastName: buyer.last, phone: buyer.phone ?? '',
        addressLine1: address.line1, addressLine2: null, city: buyer.city, state: buyer.state, country: 'IN', postalCode: buyer.pin, isDefault: true, createdAt: o.placedAt,
      });
    }
    const lastEvent = o.deliveredAt ?? o.shippedAt ?? o.confirmedAt ?? o.placedAt;
    const cancelAt = slot.status === 'CANCELLED' ? plusMin(ctx, o.placedAt, 26 * 60) : null;
    const returnAt = slot.status === 'RETURNED' ? plusMin(ctx, o.deliveredAt!, 4 * 24 * 60) : null;
    const updated = cancelAt ?? returnAt ?? lastEvent;
    const row: Row = {
      id: o.id, tenantId: ctx.tenantId, orderNumber: number, channelId: slot.ch === 'WEB' ? webId : mktId,
      externalOrderId: slot.ch === 'MKT' ? `${rng.int(402, 408)}-${digits(rng, 7)}-${digits(rng, 7)}` : null, customerId: buyer.id,
      customerEmail: buyer.email, customerPhone: buyer.phone, customerName: `${buyer.first} ${buyer.last}`, status: slot.status, subtotalPaise: o.subtotal, shippingPaise: 0n, taxPaise: 0n,
      discountPaise: o.discount, totalPaise: o.total, currencyCode: 'INR', shippingAddress: address, billingAddress: slot.ch === 'MKT' ? address : null,
      notes: slot.cc ? 'Click and collect from the showroom' : slot.pay === 'COD' ? 'Cash on delivery' : null,
      cancelReason: slot.status === 'CANCELLED' ? 'Ordered by mistake; customer asked to cancel' : null, placedAt: o.placedAt, confirmedAt: o.confirmedAt, shippedAt: o.shippedAt, deliveredAt: o.deliveredAt,
      createdAt: o.placedAt, updatedAt: updated, createdBy: null,
    };
    orderRows.push({ o, row });

    // items
    o.lines.forEach((l, k) => {
      add('onlineOrderItem', {
        id: eid(ctx, 'online-order-item', `${o.idx}-${k}`), tenantId: ctx.tenantId, orderId: o.id, catalogItemId: slot.ch === 'MKT' ? catalogIdOf(l.p.id) : null, productId: l.p.id,
        externalLineItemId: slot.ch === 'MKT' ? `LI-${digits(new Rng(`${o.id}:${k}`), 8)}` : null, title: l.p.name, quantity: 1, unitPricePaise: l.unit, totalPaise: l.unit, sku: l.p.sku,
        weightMg: l.p.grossWeightMg, createdAt: o.placedAt,
      });
      if (o.confirmedAt && l.p.showroomStockId) {
        const net = slot.status === 'CANCELLED' || slot.status === 'RETURNED' ? 0 : -1;
        stockRows.push({
          id: eid(ctx, 'stock-move-out', `${o.idx}-${k}`), tenantId: ctx.tenantId, stockItemId: l.p.showroomStockId, movementType: 'OUT', quantityChange: -1, unitCostPaise: null,
          referenceType: 'OnlineOrder', referenceId: o.id, notes: `B2C Order ${number}`, movedAt: o.confirmedAt, createdAt: o.confirmedAt,
        });
        if (net === 0) {
          const back = slot.status === 'CANCELLED' ? cancelAt! : returnAt!;
          stockRows.push({
            id: eid(ctx, 'stock-move-back', `${o.idx}-${k}`), tenantId: ctx.tenantId, stockItemId: l.p.showroomStockId, movementType: 'RETURN', quantityChange: 1, unitCostPaise: l.p.costPaise,
            referenceType: 'OnlineOrder', referenceId: o.id, notes: `${slot.status === 'CANCELLED' ? 'Cancelled' : 'Returned'} order ${number}`, movedAt: back, createdAt: back,
          });
        } else stockDeltas.set(l.p.showroomStockId, (stockDeltas.get(l.p.showroomStockId) ?? 0) - 1);
      }
    });

    // payment
    const online = slot.pay !== 'COD';
    const captured = slot.status !== 'PENDING' && slot.status !== 'CANCELLED' && slot.status !== 'RETURNED' && (online || slot.status === 'DELIVERED');
    const refunded = (slot.status === 'CANCELLED' && online) || slot.status === 'RETURNED';
    const completedAt = refunded || captured ? (online ? plusMin(ctx, o.placedAt, rng.int(2, 20)) : o.deliveredAt) : null;
    let pStatus = 'INITIATED';
    if (refunded) pStatus = 'REFUNDED';
    else if (captured) pStatus = 'CAPTURED';
    const refundAt = refunded ? (cancelAt ?? returnAt!) : null;
    const ext = online && pStatus !== 'INITIATED' ? `pay_${alnum(new Rng(`${o.id}:pay`), 14)}` : null;
    add('onlinePayment', {
      id: eid(ctx, 'online-payment', o.idx), tenantId: ctx.tenantId, orderId: o.id, gatewayId, externalPaymentId: ext, method: slot.pay, amountPaise: o.total, currencyCode: 'INR', status: pStatus,
      gatewayResponse: ext ? { id: ext, status: refunded ? 'refunded' : 'captured', method: slot.pay.toLowerCase() } : null, initiatedAt: o.placedAt, completedAt, refundedAt: refundAt,
      refundAmountPaise: refunded ? o.total : null, createdAt: o.placedAt, updatedAt: refundAt ?? completedAt ?? o.placedAt,
    });

    // shipment
    if (slot.ship) {
      const sAt = o.shippedAt ?? plusMin(ctx, o.placedAt, 20 * 60);
      const num = `SH/${yymm(sAt)}/${pad(9000 + shipSeq.next(yymm(sAt)), 4)}`;
      const carrier = CARRIERS[ship % CARRIERS.length]!;
      const trk = `${['SS', 'RR', 'ST'][ship % 3]}${digits(rng, 10)}`;
      ship++;
      const grams = Math.ceil(Number(bsum(o.lines.map((l) => l.p.grossWeightMg))) / 1000) + 150;
      add('shipment', {
        id: eid(ctx, 'shipment', o.idx), tenantId: ctx.tenantId, orderId: o.id, shipmentNumber: num, carrier, trackingNumber: trk, trackingUrl: `https://track.example.com/${trk}`,
        status: slot.ship, estimatedDeliveryDate: dateOnly(addDays(o.placedAt, 5)), actualDeliveryDate: o.deliveredAt && slot.ship === 'DELIVERED' ? dateOnly(o.deliveredAt) : null,
        weightGrams: grams, shippingCostPaise: rupees(150 + (ship % 3) * 50), labelUrl: null, createdAt: sAt, updatedAt: o.deliveredAt ?? sAt,
      });
    }

    // click and collect
    if (slot.cc) {
      const readyAt = plusMin(ctx, o.confirmedAt!, 24 * 60);
      const notified = slot.cc === 'READY_FOR_PICKUP' ? null : plusMin(ctx, readyAt, 30);
      add('clickAndCollect', {
        id: eid(ctx, 'click-collect', cc++), tenantId: ctx.tenantId, orderId: o.id, locationId: ctx.showroom.id, status: slot.cc, readyAt, notifiedAt: notified,
        pickedUpAt: slot.cc === 'PICKED_UP' ? o.deliveredAt : null, expiresAt: addDays(readyAt, 7), createdAt: readyAt, updatedAt: o.deliveredAt ?? notified ?? readyAt,
      });
    }
    if (slot.status === 'DELIVERED' || slot.status === 'RETURNED') gcProducts.push({ order: o, productId: o.lines[0]!.p.id, buyerName: `${buyer.first} ${buyer.last.charAt(0)}.` });
  }
  // order rows after payments/items are fine: createMany is per table, parents are emitted first below
  for (const { row } of orderRows) add('onlineOrder', row);

  // reviews: 6 from delivered orders (4 published, 2 pending moderation) + 2 older storefront reviews
  gcProducts.slice(0, 6).forEach((g, i) => {
    const [rating, title, body] = REVIEW_TEXT[i]!;
    const created = plusMin(ctx, g.order.deliveredAt!, (3 + i) * 24 * 60);
    const published = i < 4;
    add('productReview', {
      id: eid(ctx, 'review', i), tenantId: ctx.tenantId, productId: g.productId, channelId: webId, customerName: g.buyerName, rating, title, body, isVerified: true, isPublished: published,
      publishedAt: published ? plusMin(ctx, created, 600) : null, createdAt: created, createdBy: null,
    });
  });
  for (let i = 0; i < 2; i++) {
    const p = ctx.products[(i * 7 + 3) % ctx.products.length]!;
    const [rating, title, body] = REVIEW_TEXT[6 + i]!;
    const created = daysAgoAt(now, 50 + i * 12, 14);
    add('productReview', {
      id: eid(ctx, 'review', 6 + i), tenantId: ctx.tenantId, productId: p.id, channelId: webId, customerName: i === 0 ? 'Neha K.' : 'Rahul S.', rating, title, body, isVerified: false, isPublished: true,
      publishedAt: plusMin(ctx, created, 300), createdAt: created, createdBy: null,
    });
  }

  // wishlists (unique per customer x product)
  const wishSeen = new Set<string>();
  let w = 0;
  for (let i = 0; w < 10 && i < 60; i++) {
    const c = buyerFor(10 + (i % 12));
    const p = ctx.products[(i * 5 + 2) % ctx.products.length]!;
    const key = `${c.id}|${p.id}`;
    if (wishSeen.has(key)) continue;
    wishSeen.add(key);
    const price = listUnit(p, 20);
    const alert = w % 3 === 0;
    add('wishlist', {
      id: eid(ctx, 'wishlist', w), tenantId: ctx.tenantId, customerId: c.id, productId: p.id, addedAt: daysAgoAt(now, 3 + w * 6, 20), priceAtAddPaise: price, priceAlertEnabled: alert,
      priceAlertThresholdPaise: alert ? roundToRupee((price * 95n) / 100n) : null, priceAlertTriggered: false,
    });
    w++;
  }

  // pre-orders (+ their per-product config)
  const preSpecs: Array<{ type: 'PRE_ORDER' | 'BACKORDER' | 'MADE_TO_ORDER'; status: 'CONFIRMED' | 'IN_PRODUCTION' | 'PENDING'; days: number; lead: number; depositPct: number }> = [
    { type: 'PRE_ORDER', status: 'CONFIRMED', days: 9, lead: 21, depositPct: 20 },
    { type: 'MADE_TO_ORDER', status: 'IN_PRODUCTION', days: 16, lead: 30, depositPct: 30 },
    { type: 'BACKORDER', status: 'PENDING', days: 2, lead: 14, depositPct: 10 },
  ];
  const premium = [...ctx.products].sort((a, b) => (a.sellingPaise < b.sellingPaise ? 1 : -1));
  preSpecs.forEach((s, i) => {
    const p = premium[i * 2 % premium.length]!;
    const c = buyerFor(20 + i);
    const created = daysAgoAt(now, s.days, 15);
    const price = listUnit(p, s.days);
    add('preOrderConfig', {
      id: eid(ctx, 'preorder-config', i), tenantId: ctx.tenantId, productId: p.id, isPreOrderEnabled: s.type !== 'BACKORDER', isBackorderEnabled: s.type === 'BACKORDER', maxPreOrderQty: 5,
      depositPercentage: s.depositPct, estimatedLeadDays: s.lead, autoConfirm: i === 0, customMessage: 'Ships after in-house quality check and hallmarking.', createdAt: addDays(created, -20), createdBy: admin,
    });
    add('preOrder', {
      id: eid(ctx, 'preorder', i), tenantId: ctx.tenantId, customerId: c.id, productId: p.id, quantity: 1, status: s.status, orderType: s.type, depositPaise: roundToRupee((price * BigInt(s.depositPct)) / 100n),
      estimatedAvailableDate: dateOnly(addDays(created, s.lead)), estimatedDeliveryDate: dateOnly(addDays(created, s.lead + 3)), actualAvailableDate: null, notifiedAt: null, fulfilledOrderId: null, cancelReason: null,
      notes: s.type === 'MADE_TO_ORDER' ? 'Custom size 14; engraving requested' : null, priceLockPaise: i === 0 ? price : null, isPriceLocked: i === 0, createdAt: created, createdBy: c.id,
    });
  });

  // e-commerce notification templates (the CRM planner owns the generic ones)
  ([
    ['Order shipped', 'EMAIL', 'Your order {{orderNumber}} is on its way', 'Hi {{name}}, your order {{orderNumber}} has shipped. Track it with {{trackingNumber}}.', 'TRANSACTIONAL'],
    ['Order delivered', 'WHATSAPP', null, 'Hi {{name}}, order {{orderNumber}} was delivered. Please share your feedback on the product.', 'TRANSACTIONAL'],
    ['Click and collect ready', 'SMS', null, 'Hi {{name}}, order {{orderNumber}} is ready for pickup at our showroom. Carry a photo ID.', 'REMINDER'],
    ['Order cancelled', 'EMAIL', 'Order {{orderNumber}} cancelled', 'Hi {{name}}, your order {{orderNumber}} was cancelled and any payment will be refunded in 5-7 days.', 'TRANSACTIONAL'],
  ] as const).forEach(([name, channel, subject, body, category], i) => add('notificationTemplate', {
    id: eid(ctx, 'notif-template-ecom', i), tenantId: ctx.tenantId, name, channel, subject, body, variables: ['name', 'orderNumber', 'trackingNumber'], category, isActive: true, createdBy: admin,
  }));

  // ═══ COMPLIANCE: hallmark, AML, export ════════════════════════════
  const centerIds = Object.keys(ctx.hallmarkCenterIds).sort().map((k) => ctx.hallmarkCenterIds[k]!);
  const centerTable: Row[] = [];
  if (centerIds.length === 0) {
    // reference data is empty (fresh tenant): plan two centres, ids are global-stable
    [['DMO-HMC-001', 'Demo BIS Hallmarking Centre Mumbai', 'Mumbai', 'Maharashtra'], ['DMO-HMC-002', 'Demo BIS Hallmarking Centre Pune', 'Pune', 'Maharashtra']].forEach(([code, name, city, state], i) => {
      const id = eid({ tenantId: 'global' }, 'hallmark-center', code!);
      centerIds.push(id);
      centerTable.push({ id, centerCode: code, name, address: `${i + 1}, Jewellers Lane`, city, state, phone: `+9122${digits(new Rng(`hmc${i}`), 8)}`, email: `${code!.toLowerCase()}@example.com`, bisLicenseNumber: `CM/L-9${digits(new Rng(`hml${i}`), 6)}`, isActive: true });
    });
  }
  const hallmarkable = ctx.products.filter((p) => p.purity !== null);
  const catalogHuids = new Set<string>(ctx.products.map((p) => p.huid).filter((h): h is string => !!h));
  const assignedHuids = new Set<string>();
  const huidFor = (p: ProductInfo): string => {
    let h: string | null = p.huid && !assignedHuids.has(p.huid) ? p.huid : null;
    while (!h || assignedHuids.has(h) || (catalogHuids.has(h) && h !== p.huid)) h = alnum(rng, 6);
    assignedHuids.add(h);
    return h;
  };
  const takenProducts = new Set<string>();
  const hmSpecs: Array<{ status: 'SUBMITTED' | 'IN_PROGRESS' | 'COMPLETED' | 'PARTIAL_REJECT' | 'REJECTED'; days: number; items: number; fail: number }> = [
    { status: 'COMPLETED', days: 78, items: 3, fail: 0 }, { status: 'COMPLETED', days: 62, items: 4, fail: 0 }, { status: 'COMPLETED', days: 44, items: 3, fail: 0 },
    { status: 'PARTIAL_REJECT', days: 33, items: 4, fail: 1 }, { status: 'REJECTED', days: 24, items: 2, fail: 2 }, { status: 'IN_PROGRESS', days: 9, items: 4, fail: 0 },
    { status: 'SUBMITTED', days: 3, items: 3, fail: 0 }, { status: 'SUBMITTED', days: 1, items: 3, fail: 0 },
  ];
  hmSpecs.forEach((s, si) => {
    const submitted = daysAgoAt(now, s.days, 11);
    const id = eid(ctx, 'hallmark-submission', si);
    const finished = s.status === 'COMPLETED' || s.status === 'PARTIAL_REJECT' || s.status === 'REJECTED';
    const returned = finished ? plusMin(ctx, submitted, (2 + (si % 3)) * 24 * 60) : null;
    let passed = 0;
    let failed = 0;
    for (let k = 0; k < s.items; k++) {
      const free = hallmarkable.filter((p) => !takenProducts.has(p.id));
      const p = (free.length > 0 ? free : hallmarkable)[(si * 5 + k * 3) % (free.length > 0 ? free.length : hallmarkable.length)]!;
      takenProducts.add(p.id);
      const declared = p.purity!;
      let status: 'PENDING' | 'PASSED' | 'FAILED' = 'PENDING';
      if (finished) status = k < s.fail ? 'FAILED' : 'PASSED';
      else if (s.status === 'IN_PROGRESS') status = k < 2 ? 'PASSED' : 'PENDING';
      let huid: string | null = null;
      if (status === 'PASSED') {
        huid = huidFor(p);
        passed++;
      }
      if (status === 'FAILED') failed++;
      const tested = status === 'PENDING' ? null : status === 'FAILED' ? declared - rng.int(25, 60) : declared + rng.int(0, 2);
      add('hallmarkSubmissionItem', {
        id: eid(ctx, 'hallmark-item', `${si}-${k}`), tenantId: ctx.tenantId, submissionId: id, productId: p.id, status, testedPurity: tested, declaredPurity: declared, huidAssigned: huid,
        failureReason: status === 'FAILED' ? `Tested fineness ${tested} below declared ${declared}` : null, notes: null, createdAt: submitted, createdBy: admin,
      });
    }
    add('hallmarkSubmission', {
      id, tenantId: ctx.tenantId, submissionNumber: `HM-DEMO${pad(si + 1)}`, hallmarkCenterId: centerIds[si % centerIds.length], locationId: si % 2 === 0 ? ctx.showroom.id : ctx.workshop.id,
      status: s.status, submittedDate: submitted, expectedReturnDate: addDays(submitted, 4), actualReturnDate: returned, totalItems: s.items, passedItems: passed, failedItems: failed,
      notes: s.status === 'REJECTED' ? 'Batch rejected: low fineness on both pieces' : 'Demo hallmark submission', createdAt: submitted, updatedAt: returned ?? submitted, createdBy: admin,
    });
  });

  // AML rules and alerts (alerts reference real retail sales with a customer)
  const rules: Array<[string, string, Record<string, unknown>, string, boolean]> = [
    ['Single transaction above Rs 2,00,000', 'TRANSACTION_AMOUNT_LIMIT', { maxAmountPaise: 20_000_000 }, 'HIGH', true],
    ['High value purchase above Rs 1,00,000', 'HIGH_VALUE_ALERT', { maxAmountPaise: 10_000_000 }, 'MEDIUM', true],
    ['More than 3 purchases in a week', 'FREQUENCY_LIMIT', { maxCount: 3, period: 'WEEK' }, 'MEDIUM', true],
    ['Velocity: Rs 5,00,000 within 24 hours', 'VELOCITY_CHECK', { velocityThresholdPaise: 50_000_000 }, 'HIGH', false],
  ];
  const ruleIds = rules.map((_, i) => eid(ctx, 'aml-rule', i));
  rules.forEach(([ruleName, ruleType, parameters, severity, isActive], i) => add('amlRule', {
    id: ruleIds[i], tenantId: ctx.tenantId, ruleName, ruleType, parameters, severity, isActive, createdAt: daysAgoAt(now, 100, 10), createdBy: admin,
  }));
  const bigSales = [...retail.sales].filter((s) => s.customerId).sort((a, b) => (a.totals.totalPaise < b.totals.totalPaise ? 1 : -1)).slice(0, 3);
  const alertSpecs: Array<{ rule: number; type: string; severity: string; status: string }> = [
    { rule: 1, type: 'HIGH_VALUE', severity: 'MEDIUM', status: 'NEW' },
    { rule: 1, type: 'HIGH_VALUE', severity: 'MEDIUM', status: 'UNDER_REVIEW' },
    { rule: 2, type: 'UNUSUAL_PATTERN', severity: 'LOW', status: 'CLEARED' },
  ];
  bigSales.forEach((s, i) => {
    const a = alertSpecs[i]!;
    const created = plusMin(ctx, s.date, 5);
    const reviewed = a.status === 'NEW' ? null : plusMin(ctx, created, 26 * 60);
    add('amlAlert', {
      id: eid(ctx, 'aml-alert', i), tenantId: ctx.tenantId, customerId: s.customerId, ruleId: ruleIds[a.rule], alertType: a.type, severity: a.severity,
      description: `Purchase ${s.number} of Rs ${(Number(s.totals.totalPaise) / 100).toLocaleString('en-IN')} flagged for review`, transactionIds: [s.id], amountPaise: s.totals.totalPaise, status: a.status,
      reviewedBy: reviewed ? admin : null, reviewedAt: reviewed, reviewNotes: a.status === 'CLEARED' ? 'KYC on file, purchase consistent with profile. Cleared.' : a.status === 'UNDER_REVIEW' ? 'Collecting source-of-funds declaration.' : null,
      reportedToFiu: false, reportedAt: null, createdAt: created, updatedAt: reviewed ?? created,
    });
  });

  // export orders + invoices (amounts in the buyer currency's minor unit, like ExportService)
  const tenantPrefix = ctx.slug.substring(0, 4).toUpperCase();
  const exportBuyers = [...customers.filter((c) => c.type === 'WHOLESALE' || c.type === 'CORPORATE'), ...customers];
  const exportProducts = hallmarkable.filter((p) => !p.fixedPrice).slice(0, 6);
  const exSpecs = [
    { buyer: exportBuyers[0]!, country: 'AE', currency: 'AED', rate: 226_500, days: 85, shipDaysAgo: 68, status: 'DELIVERED', inc: 'CIF', terms: '50% advance, 50% against documents', dest: 'Dubai, UAE', port: 'Mumbai Airport (INBOM)', type: 'COMMERCIAL', picks: [0, 1, 2], qty: [12, 20, 10] },
    { buyer: exportBuyers[1] ?? exportBuyers[0]!, country: 'US', currency: 'USD', rate: 832_500, days: 14, shipDaysAgo: -1, status: 'IN_PRODUCTION', inc: 'FOB', terms: '30% advance, balance before shipment', dest: 'New York, USA', port: 'Nhava Sheva (INNSA)', type: 'PROFORMA', picks: [3, 4], qty: [15, 25] },
  ];
  exSpecs.forEach((e, ei) => {
    const created = daysAgoAt(now, e.days, 12);
    const orderId = eid(ctx, 'export-order', ei);
    const invoiceId = eid(ctx, 'export-invoice', ei);
    const ym = yymm(created);
    const items = e.picks.map((pi, k) => {
      const p = exportProducts[pi % Math.max(1, exportProducts.length)] ?? ctx.products[pi % ctx.products.length]!;
      const unit = roundDiv(p.sellingPaise * 10_000n, BigInt(e.rate)); // paise -> buyer currency minor units
      const qty = e.qty[k]!;
      return { p, unit, qty, total: unit * BigInt(qty), id: eid(ctx, 'export-order-item', `${ei}-${k}`), invItemId: eid(ctx, 'export-invoice-item', `${ei}-${k}`) };
    });
    const subtotal = bsum(items.map((i) => i.total));
    const shipping = BigInt(8_000 + ei * 2_500);
    const insurance = roundDiv(subtotal, 200n);
    const total = subtotal + shipping + insurance;
    const shipDate = e.shipDaysAgo >= 0 ? dateOnly(daysAgoAt(now, e.shipDaysAgo, 10)) : null;
    add('exportOrder', {
      id: orderId, tenantId: ctx.tenantId, orderNumber: `EXP/${tenantPrefix}/${ym}/${pad(9001 + ei, 4)}`, buyerId: e.buyer.id, buyerCountry: e.country, locationId: ctx.showroom.id, status: e.status,
      currencyCode: e.currency, exchangeRate: e.rate, subtotalPaise: subtotal, dutyPaise: 0n, shippingPaise: shipping, insurancePaise: insurance, totalPaise: total, incoterms: e.inc, paymentTerms: e.terms,
      notes: 'Demo export order', expectedShipDate: dateOnly(addDays(created, 21)), actualShipDate: shipDate, createdAt: created, updatedAt: shipDate ?? created, createdBy: admin,
    });
    items.forEach((i) => add('exportOrderItem', {
      id: i.id, tenantId: ctx.tenantId, exportOrderId: orderId, productId: i.p.id, description: i.p.name, quantity: i.qty, unitPricePaise: i.unit, totalPricePaise: i.total, hsCode: '71131910',
      weightMg: i.p.grossWeightMg * BigInt(i.qty), metalPurity: i.p.purity, countryOfOrigin: 'IN', createdAt: created, createdBy: admin,
    }));
    const invDate = plusMin(ctx, created, 48 * 60);
    add('exportInvoice', {
      id: invoiceId, tenantId: ctx.tenantId, invoiceNumber: `${e.type === 'PROFORMA' ? 'PI' : 'EI'}/${yymm(invDate)}/${pad(9001 + ei, 4)}`, exportOrderId: orderId, invoiceType: e.type, buyerId: e.buyer.id,
      currencyCode: e.currency, exchangeRate: e.rate, subtotalPaise: subtotal, totalPaise: subtotal, igstPaise: 0n,
      lutNumber: e.type === 'COMMERCIAL' ? `LUT/${String(now.getFullYear()).slice(2)}-${String(now.getFullYear() + 1).slice(2)}/0412` : null,
      lutDate: e.type === 'COMMERCIAL' ? dateOnly(new Date(now.getFullYear(), 3, 1)) : null, adCode: '6390123', ieCode: '0388123456', preCarriageBy: 'Road', placeOfReceipt: ctx.showroom.city,
      vesselFlightNo: e.type === 'COMMERCIAL' ? 'AI-914' : null, portOfLoading: e.port, portOfDischarge: e.dest, finalDestination: e.dest, terms: e.terms, createdAt: invDate, createdBy: admin,
    });
    items.forEach((i) => add('exportInvoiceItem', {
      id: i.invItemId, tenantId: ctx.tenantId, invoiceId, exportOrderItemId: i.id, description: i.p.name, quantity: i.qty, unitPricePaise: i.unit, totalPricePaise: i.total, hsCode: '71131910',
      weightMg: i.p.grossWeightMg * BigInt(i.qty), netWeightMg: i.p.netWeightMg * BigInt(i.qty), countryOfOrigin: 'IN', createdAt: invDate,
    }));
  });

  // ═══ assemble (parents first) ════════════════════════════════════
  const payrollTables = planPayrollTables(ctx);
  const platformTables = planPlatformTables(ctx);
  const cmsTables = planCmsTables(ctx);
  const mine = (m: string): TablePlan[] => (t[m] ? [{ model: m, rows: t[m]! }] : []);
  const stockDeltaList = [...stockDeltas.entries()].map(([stockItemId, delta]) => ({ stockItemId, delta }));
  const hallmarkCenters: TablePlan[] = centerTable.length ? [{ model: 'hallmarkCenter', rows: centerTable }] : [];
  const tables: TablePlan[] = [
    ...payrollTables, ...platformTables, ...cmsTables,
    ...['salesChannel', 'paymentGateway', 'catalogItem', 'customerAddress', 'onlineOrder', 'onlineOrderItem', 'onlinePayment', 'shipment', 'clickAndCollect'].flatMap(mine),
    ...['stockMovement'].flatMap(() => (stockRows.length ? [{ model: 'stockMovement', rows: stockRows }] : [])),
    ...['productReview', 'wishlist', 'preOrderConfig', 'preOrder', 'notificationTemplate'].flatMap(mine),
    ...hallmarkCenters,
    ...['hallmarkSubmission', 'hallmarkSubmissionItem', 'amlRule', 'amlAlert', 'exportOrder', 'exportOrderItem', 'exportInvoice', 'exportInvoiceItem'].flatMap(mine),
  ];
  return {
    name: 'people-commerce',
    sentinel: { model: 'salesChannel', id: webId },
    tables,
    stockDeltas: stockDeltaList,
  };
}
