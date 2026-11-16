import { describe, it, expect } from 'vitest';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { StaffAuthGuard } from '../staff-auth.guard';

function ctx(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('StaffAuthGuard', () => {
  const guard = new StaffAuthGuard();

  it('allows requests where the middleware populated userId and tenantId', () => {
    expect(guard.canActivate(ctx({ userId: 'user-1', tenantId: 'tenant-1' }))).toBe(true);
  });

  it('rejects requests without userId', () => {
    expect(() => guard.canActivate(ctx({ tenantId: 'tenant-1' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects requests without tenantId', () => {
    expect(() => guard.canActivate(ctx({ userId: 'user-1' }))).toThrow(UnauthorizedException);
  });

  it('rejects requests with neither userId nor tenantId', () => {
    expect(() => guard.canActivate(ctx({}))).toThrow('Staff authentication required');
  });

  it('rejects empty-string identity values', () => {
    expect(() => guard.canActivate(ctx({ userId: '', tenantId: 'tenant-1' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('does not trust tenant or user identity supplied in request headers', () => {
    const request = {
      headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
    };
    expect(() => guard.canActivate(ctx(request))).toThrow(UnauthorizedException);
  });
});
