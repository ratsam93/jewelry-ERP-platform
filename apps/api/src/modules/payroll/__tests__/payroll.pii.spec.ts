import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PayrollEmployeeService } from '../payroll.employee.service';
import { PayrollPayslipService } from '../payroll.payslip.service';
import { createMockPrismaService, TEST_TENANT_ID } from '../../../__tests__/setup';

const rawEmployee = {
  id: 'e1',
  firstName: 'Ravi',
  lastName: 'Kumar',
  employeeCode: 'E001',
  panNumber: 'ABCDE1234F',
  aadhaarNumber: '234567890124',
  bankAccountNumber: '123456789012',
  bankIfsc: 'HDFC0001234',
};

describe('Payroll PII masking', () => {
  let prisma: any;
  beforeEach(() => {
    prisma = {
      ...createMockPrismaService(),
      employee: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
      payslip: { findFirst: vi.fn(), findMany: vi.fn() },
    };
  });

  it('employee.list masks PAN, Aadhaar and bank account', async () => {
    prisma.employee.findMany.mockResolvedValue([rawEmployee]);
    prisma.employee.count.mockResolvedValue(1);
    const res = await new PayrollEmployeeService(prisma).list(TEST_TENANT_ID, {} as any);
    const e = res.items[0] as any;
    expect(e.panNumber).toBe('ABXXXXXXXF');
    expect(e.aadhaarNumber).toBe('XXXX-XXXX-0124');
    expect(e.bankAccountNumber).toBe('XXXXXXXX9012');
    expect(e.bankIfsc).toBe('HDFC0001234');
  });

  it('employee.getById (detail page) masks PAN, Aadhaar and bank account', async () => {
    prisma.employee.findFirst.mockResolvedValue(rawEmployee);
    const e: any = await new PayrollEmployeeService(prisma).getById(TEST_TENANT_ID, 'e1');
    expect(e.panNumber).toBe('ABXXXXXXXF');
    expect(e.aadhaarNumber).toBe('XXXX-XXXX-0124');
    expect(e.bankAccountNumber).toBe('XXXXXXXX9012');
    expect(JSON.stringify(e)).not.toContain('234567890124');
  });

  it('employee.getForEdit stays raw (feeds only the admin edit form)', async () => {
    prisma.employee.findFirst.mockResolvedValue(rawEmployee);
    const e = await new PayrollEmployeeService(prisma).getForEdit(TEST_TENANT_ID, 'e1');
    expect(e.panNumber).toBe('ABCDE1234F');
    expect(e.aadhaarNumber).toBe('234567890124');
    expect(e.bankAccountNumber).toBe('123456789012');
  });

  it('employee.update response is masked', async () => {
    prisma.employee.findFirst.mockResolvedValue(rawEmployee);
    prisma.employee.update.mockResolvedValue(rawEmployee);
    const e: any = await new PayrollEmployeeService(prisma).update(TEST_TENANT_ID, 'e1', {} as any);
    expect(e.aadhaarNumber).toBe('XXXX-XXXX-0124');
  });

  it('payslip list and getById mask the embedded employee', async () => {
    const slip = { id: 'p1', employee: rawEmployee, payrollPeriod: { id: 'pp' } };
    prisma.payslip.findMany.mockResolvedValue([slip]);
    prisma.payslip.findFirst.mockResolvedValue(slip);
    const svc = new PayrollPayslipService(prisma);
    const list: any[] = await svc.list(TEST_TENANT_ID, {} as any);
    expect(list[0].employee.panNumber).toBe('ABXXXXXXXF');
    expect(list[0].employee.bankAccountNumber).toBe('XXXXXXXX9012');
    const one: any = await svc.getById(TEST_TENANT_ID, 'p1');
    expect(one.employee.aadhaarNumber).toBe('XXXX-XXXX-0124');
  });
});
