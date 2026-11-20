import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PlatformUserService } from '../platform.user.service';
import {
  createMockPrismaService,
  createMockEventBus,
  TEST_TENANT_ID,
  TEST_USER_ID,
  resetAllMocks,
} from '../../../__tests__/setup';

describe('PlatformUserService (Unit)', () => {
  let service: PlatformUserService;
  let mockPrisma: ReturnType<typeof createMockPrismaService>;
  let mockEventBus: ReturnType<typeof createMockEventBus>;

  const audit = { userId: TEST_USER_ID };

  beforeEach(() => {
    mockPrisma = createMockPrismaService();
    mockEventBus = createMockEventBus();
    service = new PlatformUserService(mockPrisma as any, mockEventBus as any);
    resetAllMocks(mockPrisma);
    // The shared mock has no role model and a callback-only $transaction.
    (mockPrisma as any).role = { findFirst: vi.fn() };
    (mockPrisma as any).$transaction = vi.fn(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(mockPrisma),
    );
  });

  // ─── inviteUser ─────────────────────────────────────────────

  describe('inviteUser', () => {
    it('creates a user with a temporary password and publishes event', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'new-user-id',
        email: 'new@example.com',
        firstName: 'New',
        lastName: 'User',
        roleId: null,
        isActive: true,
        createdAt: new Date(),
      });

      const result = await service.inviteUser(TEST_TENANT_ID, {
        email: 'new@example.com',
        firstName: 'New',
        lastName: 'User',
      }, audit);

      expect(result.email).toBe('new@example.com');
      // Truthful: no email service is wired, so nothing was emailed.
      expect(result.emailSent).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(/tempPassword|passwordHash/);
      expect(mockPrisma.user.create).toHaveBeenCalledOnce();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'platform.user.created' }),
      );
    });

    it('throws ConflictException if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-id' });

      await expect(
        service.inviteUser(TEST_TENANT_ID, {
          email: 'existing@example.com',
          firstName: 'E',
          lastName: 'U',
        }, audit),
      ).rejects.toThrow(ConflictException);
    });

    it('assigns a roleId when provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'u-1',
        email: 'r@example.com',
        firstName: 'R',
        lastName: 'U',
        roleId: 'role-1',
        isActive: true,
        createdAt: new Date(),
      });

      await service.inviteUser(TEST_TENANT_ID, {
        email: 'r@example.com',
        firstName: 'R',
        lastName: 'U',
        roleId: 'role-1',
      }, audit);

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ roleId: 'role-1' }),
        }),
      );
    });
  });

  describe('inviteUser email reporting', () => {
    it('reports emailSent=true when the email provider accepts the message', async () => {
      const email = { sendEmail: vi.fn().mockResolvedValue({}) };
      const svc = new PlatformUserService(mockPrisma as any, mockEventBus as any, email as any);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'u', email: 'a@b.com', firstName: 'A', lastName: 'B', roleId: null, isActive: true, createdAt: new Date() });
      const res = await svc.inviteUser(TEST_TENANT_ID, { email: 'a@b.com', firstName: 'A', lastName: 'B' }, audit);
      expect(res.emailSent).toBe(true);
    });

    it('reports emailSent=false when the provider is not configured', async () => {
      const email = { sendEmail: vi.fn().mockRejectedValue(new Error('missing setting "sendgrid_api_key"')) };
      const svc = new PlatformUserService(mockPrisma as any, mockEventBus as any, email as any);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'u', email: 'a@b.com', firstName: 'A', lastName: 'B', roleId: null, isActive: true, createdAt: new Date() });
      const res = await svc.inviteUser(TEST_TENANT_ID, { email: 'a@b.com', firstName: 'A', lastName: 'B' }, audit);
      expect(res.emailSent).toBe(false);
    });
  });

  // ─── createUser / setPassword ───────────────────────────────

  describe('createUser', () => {
    const input = { email: 'New@Example.com', firstName: 'N', lastName: 'U', roleId: 'role-1', password: 'Str0ng!Passw0rd' };
    const created = { id: 'u-1', email: 'new@example.com', firstName: 'N', lastName: 'U', roleId: 'role-1', isActive: true, createdAt: new Date() };

    it('creates an active user with a bcrypt hash and never returns the password', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({ id: 'role-1' });
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(created);

      const res = await service.createUser(TEST_TENANT_ID, input, audit);

      const data = mockPrisma.user.create.mock.calls[0][0].data;
      expect(data.isActive).toBe(true);
      expect(data.tenantId).toBe(TEST_TENANT_ID);
      expect(data.email).toBe('new@example.com');
      expect(data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
      expect(data.passwordHash).not.toContain(input.password);
      expect(JSON.stringify(res)).not.toMatch(/Str0ng|passwordHash|password/i);
      expect(mockEventBus.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'platform.user.created' }));
    });

    it('rejects a weak password before touching the database', async () => {
      await expect(service.createUser(TEST_TENANT_ID, { ...input, password: 'short' }, audit)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate email in the tenant with a conflict', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({ id: 'role-1' });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'x' });
      await expect(service.createUser(TEST_TENANT_ID, input, audit)).rejects.toThrow(ConflictException);
    });

    it('rejects a role from another tenant', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      await expect(service.createUser(TEST_TENANT_ID, input, audit)).rejects.toThrow(NotFoundException);
    });
  });

  describe('setPassword', () => {
    it('hashes, saves and revokes refresh tokens', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u-1' });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });
      await expect(service.setPassword(TEST_TENANT_ID, 'u-1', 'Str0ng!Passw0rd')).resolves.toEqual({ success: true });
      expect(mockPrisma.user.update.mock.calls[0][0].data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u-1', revokedAt: null } }),
      );
    });

    it('enforces the policy and 404s unknown users', async () => {
      await expect(service.setPassword(TEST_TENANT_ID, 'u-1', 'weak')).rejects.toThrow(BadRequestException);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.setPassword(TEST_TENANT_ID, 'u-1', 'Str0ng!Passw0rd')).rejects.toThrow(NotFoundException);
    });
  });

  describe('last admin guard on deactivate', () => {
    it('blocks deactivating the last active admin', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce({ id: 'u-2' }) // ensureUserExists
        .mockResolvedValueOnce({ isActive: true, role: { name: 'Admin' } }); // guard target
      mockPrisma.user.count.mockResolvedValue(0);
      await expect(service.deactivateUser(TEST_TENANT_ID, 'u-2', audit)).rejects.toThrow(/last active administrator/);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('allows deactivating an admin when another remains', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce({ id: 'u-2' })
        .mockResolvedValueOnce({ isActive: true, role: { name: 'Admin' } });
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.user.update.mockResolvedValue({ id: 'u-2', isActive: false });
      await expect(service.deactivateUser(TEST_TENANT_ID, 'u-2', audit)).resolves.toBeDefined();
    });
  });

  // ─── listUsers ──────────────────────────────────────────────

  describe('listUsers', () => {
    it('returns paginated users', async () => {
      const users = [{ id: 'u1' }, { id: 'u2' }];
      mockPrisma.user.findMany.mockResolvedValue(users);
      mockPrisma.user.count.mockResolvedValue(12);

      const result = await service.listUsers(TEST_TENANT_ID, { page: 1, limit: 10 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(12);
      expect(result.totalPages).toBe(2);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrevious).toBe(false);
    });

    it('filters by search term', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.listUsers(TEST_TENANT_ID, { page: 1, limit: 10, search: 'john' });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { firstName: { contains: 'john' } },
            ]),
          }),
        }),
      );
    });

    it('filters by isActive flag', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.listUsers(TEST_TENANT_ID, { page: 1, limit: 10, isActive: true });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });
  });

  // ─── getUserById ────────────────────────────────────────────

  describe('getUserById', () => {
    it('returns user when found', async () => {
      const user = { id: 'u-1', email: 'x@y.com', firstName: 'X', lastName: 'Y' };
      mockPrisma.user.findFirst.mockResolvedValue(user);

      const result = await service.getUserById(TEST_TENANT_ID, 'u-1');
      expect(result.id).toBe('u-1');
    });

    it('throws NotFoundException when user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.getUserById(TEST_TENANT_ID, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── activateUser / deactivateUser ──────────────────────────

  describe('activateUser', () => {
    it('sets isActive to true', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u-1' });
      mockPrisma.user.update.mockResolvedValue({ id: 'u-1', isActive: true });

      const result = await service.activateUser(TEST_TENANT_ID, 'u-1', audit);
      expect(result.isActive).toBe(true);
    });
  });

  describe('deactivateUser', () => {
    it('sets isActive to false', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u-2' });
      mockPrisma.user.update.mockResolvedValue({ id: 'u-2', isActive: false });

      const result = await service.deactivateUser(TEST_TENANT_ID, 'u-2', { userId: 'different-user' });
      expect(result.isActive).toBe(false);
    });

    it('prevents deactivating own account', async () => {
      await expect(
        service.deactivateUser(TEST_TENANT_ID, TEST_USER_ID, audit),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for unknown user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.deactivateUser(TEST_TENANT_ID, 'unknown', { userId: 'other' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateProfile ──────────────────────────────────────────

  describe('updateProfile', () => {
    it('updates firstName and lastName', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u-1' });
      mockPrisma.user.update.mockResolvedValue({
        id: 'u-1',
        firstName: 'Updated',
        lastName: 'Name',
      });

      const result = await service.updateProfile(TEST_TENANT_ID, 'u-1', {
        firstName: 'Updated',
        lastName: 'Name',
      }, audit);

      expect(result.firstName).toBe('Updated');
    });
  });

  // ─── enforcePasswordPolicy ──────────────────────────────────

  describe('enforcePasswordPolicy', () => {
    it('accepts a strong password', () => {
      expect(() => service.enforcePasswordPolicy('StrongP@ss12')).not.toThrow();
    });

    it('rejects password shorter than 10 characters', () => {
      expect(() => service.enforcePasswordPolicy('Sh@1')).toThrow(BadRequestException);
    });

    it('rejects password without uppercase', () => {
      expect(() => service.enforcePasswordPolicy('lowercase@12')).toThrow(BadRequestException);
    });

    it('rejects password without lowercase', () => {
      expect(() => service.enforcePasswordPolicy('UPPERCASE@12')).toThrow(BadRequestException);
    });

    it('rejects password without numbers', () => {
      expect(() => service.enforcePasswordPolicy('NoNumbersAt@!')).toThrow(BadRequestException);
    });

    it('rejects password without special characters', () => {
      expect(() => service.enforcePasswordPolicy('NoSpecial1Abc')).toThrow(BadRequestException);
    });
  });

  // ─── changePassword ─────────────────────────────────────────

  describe('changePassword', () => {
    it('throws NotFoundException when user does not exist', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.changePassword(TEST_TENANT_ID, 'u-1', {
          currentPassword: 'old',
          newPassword: 'New@Pass1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when current password is wrong', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u-1',
        passwordHash: '$2a$12$invalidhash',
      });

      await expect(
        service.changePassword(TEST_TENANT_ID, 'u-1', {
          currentPassword: 'wrongpassword',
          newPassword: 'New@Pass1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
