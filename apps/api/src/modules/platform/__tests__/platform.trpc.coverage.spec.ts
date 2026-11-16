import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrpcService } from '../../../trpc/trpc.service';
import { PlatformTrpc } from '../platform.trpc';

describe('PlatformTrpc procedure coverage', () => {
  const trpc = new TrpcService();

  // Valid RFC 9562 v4 UUIDs (Zod 4 validates version and variant nibbles)
  const TENANT = 'tenant-1';
  const USER = 'user-1';
  const ID_A = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
  const ID_B = '1c2d3e4f-5a6b-4c7d-9e8f-0a1b2c3d4e5f';
  const ID_C = '2d3e4f5a-6b7c-4d8e-8f9a-1b2c3d4e5f6a';

  const userService = {
    listUsers: vi.fn(),
    getUserById: vi.fn(),
    inviteUser: vi.fn(),
    activateUser: vi.fn(),
    deactivateUser: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
  };
  const roleService = {
    listRoles: vi.fn(),
    getRoleById: vi.fn(),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRole: vi.fn(),
    assignRoleToUser: vi.fn(),
    getAllPermissions: vi.fn(),
    seedDefaultPermissions: vi.fn(),
  };
  const branchService = {
    listBranches: vi.fn(),
    getBranchById: vi.fn(),
    createBranch: vi.fn(),
    updateBranch: vi.fn(),
    deactivateBranch: vi.fn(),
    setUserActiveBranch: vi.fn(),
    updateBranchSettings: vi.fn(),
  };
  const settingsService = {
    getSettings: vi.fn(),
    getSetting: vi.fn(),
    setSettings: vi.fn(),
    initializeDefaults: vi.fn(),
  };
  const importService = {
    getEntityFields: vi.fn(),
    createImportJob: vi.fn(),
    processImport: vi.fn(),
    getImportJob: vi.fn(),
    listImportJobs: vi.fn(),
  };
  const exportService = {
    createExportJob: vi.fn(),
    getExportJob: vi.fn(),
    listExportJobs: vi.fn(),
  };
  const auditService = {
    queryAuditLogs: vi.fn(),
    getAuditEntityTypes: vi.fn(),
    queryActivityLogs: vi.fn(),
  };
  const notificationService = {
    getUserNotifications: vi.fn(),
    getUnreadCount: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    deleteNotification: vi.fn(),
  };
  const i18nService = {
    getSupportedLocales: vi.fn(),
    getNamespaces: vi.fn(),
    getTranslationsByNamespace: vi.fn(),
    listTranslationKeys: vi.fn(),
    createTranslationKey: vi.fn(),
    updateTranslationKey: vi.fn(),
    deleteTranslationKey: vi.fn(),
    bulkUpdateTranslations: vi.fn(),
  };

  const ctx = {
    tenantId: TENANT,
    userId: USER,
    userRole: 'admin',
    userPermissions: ['*'],
  };

  const routerInstance = new PlatformTrpc(
    trpc,
    userService as never,
    roleService as never,
    branchService as never,
    settingsService as never,
    importService as never,
    exportService as never,
    auditService as never,
    notificationService as never,
    {} as never, // PlatformFileService: no procedures exposed
    i18nService as never,
  );
  const caller = routerInstance.router.createCaller(ctx);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Users ──────────────────────────────────────────────
  describe('users.list', () => {
    it('delegates with pagination defaults and filters', async () => {
      userService.listUsers.mockResolvedValue({ items: [], total: 0 });
      await caller.users.list({ search: 'asha', isActive: true });
      expect(userService.listUsers).toHaveBeenCalledWith(TENANT, {
        page: 1,
        limit: 20,
        sortBy: undefined,
        sortOrder: 'desc',
        search: 'asha',
        isActive: true,
      });
    });

    it('rejects a limit above 100', async () => {
      await expect(caller.users.list({ limit: 500 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('users.getById', () => {
    it('fetches a user in the tenant', async () => {
      userService.getUserById.mockResolvedValue({ id: ID_A });
      const result = await caller.users.getById({ userId: ID_A });
      expect(userService.getUserById).toHaveBeenCalledWith(TENANT, ID_A);
      expect(result).toEqual({ id: ID_A });
    });
  });

  describe('users.invite', () => {
    it('invites a user with the caller as actor', async () => {
      userService.inviteUser.mockResolvedValue({ id: ID_A });
      const input = {
        email: 'new.user@example.com',
        firstName: 'Meera',
        lastName: 'Iyer',
        roleId: ID_B,
      };
      await caller.users.invite(input);
      expect(userService.inviteUser).toHaveBeenCalledWith(TENANT, input, { userId: USER });
    });

    it('rejects an invalid email', async () => {
      await expect(
        caller.users.invite({ email: 'nope', firstName: 'A', lastName: 'B' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('users.activate / users.deactivate', () => {
    it('activates a user', async () => {
      userService.activateUser.mockResolvedValue({ isActive: true });
      await caller.users.activate({ userId: ID_A });
      expect(userService.activateUser).toHaveBeenCalledWith(TENANT, ID_A, { userId: USER });
    });

    it('deactivates a user', async () => {
      userService.deactivateUser.mockResolvedValue({ isActive: false });
      await caller.users.deactivate({ userId: ID_A });
      expect(userService.deactivateUser).toHaveBeenCalledWith(TENANT, ID_A, { userId: USER });
    });
  });

  describe('users.updateProfile', () => {
    it('forwards only profile fields, not the target userId', async () => {
      userService.updateProfile.mockResolvedValue({ id: ID_A });
      await caller.users.updateProfile({
        userId: ID_A,
        firstName: 'Asha',
        preferences: { theme: 'dark' },
      });
      expect(userService.updateProfile).toHaveBeenCalledWith(
        TENANT,
        ID_A,
        { firstName: 'Asha', preferences: { theme: 'dark' } },
        { userId: USER },
      );
    });
  });

  describe('users.changePassword', () => {
    it('changes the caller password', async () => {
      userService.changePassword.mockResolvedValue({ success: true });
      await caller.users.changePassword({ currentPassword: 'old-pass', newPassword: 'new-pass-123' });
      expect(userService.changePassword).toHaveBeenCalledWith(TENANT, USER, {
        currentPassword: 'old-pass',
        newPassword: 'new-pass-123',
      });
    });

    it('rejects a new password shorter than 8 characters', async () => {
      await expect(
        caller.users.changePassword({ currentPassword: 'old-pass', newPassword: 'short' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  // ─── Roles ──────────────────────────────────────────────
  describe('roles.list', () => {
    it('lists roles for the tenant', async () => {
      roleService.listRoles.mockResolvedValue([]);
      await caller.roles.list();
      expect(roleService.listRoles).toHaveBeenCalledWith(TENANT);
    });
  });

  describe('roles.getById', () => {
    it('gets a role by id', async () => {
      roleService.getRoleById.mockResolvedValue({ id: ID_A });
      await caller.roles.getById({ roleId: ID_A });
      expect(roleService.getRoleById).toHaveBeenCalledWith(TENANT, ID_A);
    });
  });

  describe('roles.create', () => {
    it('creates a role with permissions', async () => {
      roleService.createRole.mockResolvedValue({ id: ID_A });
      const input = { name: 'Cashier', permissions: ['retail.sale.read'] };
      await caller.roles.create(input);
      expect(roleService.createRole).toHaveBeenCalledWith(TENANT, input, { userId: USER });
    });

    it('rejects a role without a permissions array', async () => {
      await expect(caller.roles.create({ name: 'Cashier' } as never)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });
  });

  describe('roles.update', () => {
    it('updates role fields without the roleId', async () => {
      roleService.updateRole.mockResolvedValue({ id: ID_A });
      await caller.roles.update({ roleId: ID_A, name: 'Senior Cashier' });
      expect(roleService.updateRole).toHaveBeenCalledWith(
        TENANT,
        ID_A,
        { name: 'Senior Cashier' },
        { userId: USER },
      );
    });
  });

  describe('roles.delete', () => {
    it('deletes a role', async () => {
      roleService.deleteRole.mockResolvedValue({ deleted: true });
      await caller.roles.delete({ roleId: ID_A });
      expect(roleService.deleteRole).toHaveBeenCalledWith(TENANT, ID_A);
    });
  });

  describe('roles.assignToUser', () => {
    it('assigns a role to a user', async () => {
      roleService.assignRoleToUser.mockResolvedValue({ userId: ID_B });
      await caller.roles.assignToUser({ userId: ID_B, roleId: ID_A });
      expect(roleService.assignRoleToUser).toHaveBeenCalledWith(TENANT, ID_B, ID_A, { userId: USER });
    });
  });

  describe('roles.permissions / roles.seedPermissions', () => {
    it('returns the permission catalogue', async () => {
      roleService.getAllPermissions.mockResolvedValue(['retail.sale.read']);
      const result = await caller.roles.permissions();
      expect(roleService.getAllPermissions).toHaveBeenCalledWith();
      expect(result).toEqual(['retail.sale.read']);
    });

    it('seeds default permissions', async () => {
      roleService.seedDefaultPermissions.mockResolvedValue({ seeded: 12 });
      const result = await caller.roles.seedPermissions();
      expect(roleService.seedDefaultPermissions).toHaveBeenCalledWith();
      expect(result).toEqual({ seeded: 12 });
    });
  });

  // ─── Branches ───────────────────────────────────────────
  describe('branches.list', () => {
    it('lists active branches when no input is given', async () => {
      branchService.listBranches.mockResolvedValue([]);
      await caller.branches.list();
      expect(branchService.listBranches).toHaveBeenCalledWith(TENANT, undefined);
    });

    it('includes inactive branches when requested', async () => {
      branchService.listBranches.mockResolvedValue([]);
      await caller.branches.list({ includeInactive: true });
      expect(branchService.listBranches).toHaveBeenCalledWith(TENANT, true);
    });
  });

  describe('branches.getById', () => {
    it('gets a branch by id', async () => {
      branchService.getBranchById.mockResolvedValue({ id: ID_A });
      await caller.branches.getById({ branchId: ID_A });
      expect(branchService.getBranchById).toHaveBeenCalledWith(TENANT, ID_A);
    });
  });

  describe('branches.create', () => {
    it('creates a branch with the caller as actor', async () => {
      branchService.createBranch.mockResolvedValue({ id: ID_A });
      const input = { name: 'Main Showroom', locationType: 'SHOWROOM' as const, city: 'Mumbai' };
      await caller.branches.create(input);
      expect(branchService.createBranch).toHaveBeenCalledWith(TENANT, input, { userId: USER });
    });

    it('rejects an unknown location type', async () => {
      await expect(
        caller.branches.create({ name: 'X', locationType: 'MARS' } as never),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('branches.update', () => {
    it('updates branch fields without the branchId', async () => {
      branchService.updateBranch.mockResolvedValue({ id: ID_A });
      await caller.branches.update({ branchId: ID_A, name: 'Main' });
      expect(branchService.updateBranch).toHaveBeenCalledWith(TENANT, ID_A, { name: 'Main' }, { userId: USER });
    });
  });

  describe('branches.deactivate', () => {
    it('deactivates a branch', async () => {
      branchService.deactivateBranch.mockResolvedValue({ isActive: false });
      await caller.branches.deactivate({ branchId: ID_A });
      expect(branchService.deactivateBranch).toHaveBeenCalledWith(TENANT, ID_A, { userId: USER });
    });
  });

  describe('branches.setUserActiveBranch', () => {
    it('sets the caller active branch', async () => {
      branchService.setUserActiveBranch.mockResolvedValue({ activeBranchId: ID_A });
      await caller.branches.setUserActiveBranch({ branchId: ID_A });
      expect(branchService.setUserActiveBranch).toHaveBeenCalledWith(TENANT, USER, ID_A);
    });
  });

  describe('branches.updateSettings', () => {
    it('replaces branch settings', async () => {
      branchService.updateBranchSettings.mockResolvedValue({ id: ID_A });
      await caller.branches.updateSettings({ branchId: ID_A, settings: { currency: 'INR' } });
      expect(branchService.updateBranchSettings).toHaveBeenCalledWith(
        TENANT,
        ID_A,
        { currency: 'INR' },
        { userId: USER },
      );
    });
  });

  // ─── Settings ───────────────────────────────────────────
  describe('settings.getAll', () => {
    it('gets all settings when no category is given', async () => {
      settingsService.getSettings.mockResolvedValue([]);
      await caller.settings.getAll();
      expect(settingsService.getSettings).toHaveBeenCalledWith(TENANT, undefined);
    });

    it('filters by category', async () => {
      settingsService.getSettings.mockResolvedValue([]);
      await caller.settings.getAll({ category: 'tax' });
      expect(settingsService.getSettings).toHaveBeenCalledWith(TENANT, 'tax');
    });
  });

  describe('settings.get', () => {
    it('gets a single setting by key', async () => {
      settingsService.getSetting.mockResolvedValue({ key: 'currency', value: 'INR' });
      const result = await caller.settings.get({ key: 'currency' });
      expect(settingsService.getSetting).toHaveBeenCalledWith(TENANT, 'currency');
      expect(result).toEqual({ key: 'currency', value: 'INR' });
    });
  });

  describe('settings.set', () => {
    it('writes a batch of settings with the caller as actor', async () => {
      settingsService.setSettings.mockResolvedValue({ updated: 1 });
      const settings = [{ key: 'gst.rate', value: 3, category: 'tax' as const }];
      await caller.settings.set({ settings });
      expect(settingsService.setSettings).toHaveBeenCalledWith(TENANT, settings, { userId: USER });
    });

    it('rejects an unknown settings category', async () => {
      await expect(
        caller.settings.set({ settings: [{ key: 'k', value: 1, category: 'unknown' }] } as never),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('settings.initialize', () => {
    it('initialises default settings for the tenant', async () => {
      settingsService.initializeDefaults.mockResolvedValue({ created: 20 });
      const result = await caller.settings.initialize();
      expect(settingsService.initializeDefaults).toHaveBeenCalledWith(TENANT);
      expect(result).toEqual({ created: 20 });
    });
  });

  // ─── Import ─────────────────────────────────────────────
  describe('import.getEntityFields', () => {
    it('returns importable fields for an entity type', async () => {
      importService.getEntityFields.mockReturnValue([{ key: 'firstName' }]);
      const result = await caller.import.getEntityFields({ entityType: 'customer' });
      expect(importService.getEntityFields).toHaveBeenCalledWith('customer');
      expect(result).toEqual([{ key: 'firstName' }]);
    });

    it('rejects an unsupported entity type', async () => {
      await expect(
        caller.import.getEntityFields({ entityType: 'invoice' } as never),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('import.create', () => {
    it('creates an import job with the column mapping', async () => {
      importService.createImportJob.mockResolvedValue({ id: ID_A });
      const input = {
        fileName: 'customers.csv',
        entityType: 'customer' as const,
        totalRows: 2,
        columnMapping: { Name: 'firstName' },
      };
      await caller.import.create(input);
      expect(importService.createImportJob).toHaveBeenCalledWith(TENANT, input, { userId: USER });
    });
  });

  describe('import.process', () => {
    it('processes rows for an import job', async () => {
      importService.processImport.mockResolvedValue({ processed: 1 });
      const rows = [{ firstName: 'Asha' }];
      await caller.import.process({ importJobId: ID_A, rows });
      expect(importService.processImport).toHaveBeenCalledWith(TENANT, ID_A, rows, { userId: USER });
    });
  });

  describe('import.getJob / import.listJobs', () => {
    it('gets an import job', async () => {
      importService.getImportJob.mockResolvedValue({ id: ID_A });
      await caller.import.getJob({ jobId: ID_A });
      expect(importService.getImportJob).toHaveBeenCalledWith(TENANT, ID_A);
    });

    it('lists import jobs with paging defaults', async () => {
      importService.listImportJobs.mockResolvedValue({ items: [] });
      await caller.import.listJobs({});
      expect(importService.listImportJobs).toHaveBeenCalledWith(TENANT, 1, 20);
    });
  });

  // ─── Export ─────────────────────────────────────────────
  describe('export.create', () => {
    it('creates an export job with filters and format', async () => {
      exportService.createExportJob.mockResolvedValue({ id: ID_A });
      const input = { entityType: 'invoice' as const, format: 'PDF' as const, filters: { year: 2026 } };
      await caller.export.create(input);
      expect(exportService.createExportJob).toHaveBeenCalledWith(TENANT, input, { userId: USER });
    });
  });

  describe('export.getJob / export.listJobs', () => {
    it('gets an export job', async () => {
      exportService.getExportJob.mockResolvedValue({ id: ID_A });
      await caller.export.getJob({ jobId: ID_A });
      expect(exportService.getExportJob).toHaveBeenCalledWith(TENANT, ID_A);
    });

    it('lists export jobs with paging', async () => {
      exportService.listExportJobs.mockResolvedValue({ items: [] });
      await caller.export.listJobs({ page: 3, limit: 10 });
      expect(exportService.listExportJobs).toHaveBeenCalledWith(TENANT, 3, 10);
    });
  });

  // ─── Audit ──────────────────────────────────────────────
  describe('audit.logs', () => {
    it('queries audit logs with entity and user filters', async () => {
      auditService.queryAuditLogs.mockResolvedValue({ items: [] });
      await caller.audit.logs({ entityType: 'Customer', userId: ID_A });
      expect(auditService.queryAuditLogs).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ entityType: 'Customer', userId: ID_A, page: 1, limit: 20, sortOrder: 'desc' }),
      );
    });
  });

  describe('audit.entityTypes', () => {
    it('returns the audited entity types', async () => {
      auditService.getAuditEntityTypes.mockResolvedValue(['Customer', 'Product']);
      const result = await caller.audit.entityTypes();
      expect(auditService.getAuditEntityTypes).toHaveBeenCalledWith(TENANT);
      expect(result).toEqual(['Customer', 'Product']);
    });
  });

  describe('audit.activities', () => {
    it('queries activity logs with action and date filters', async () => {
      auditService.queryActivityLogs.mockResolvedValue({ items: [] });
      await caller.audit.activities({ action: 'LOGIN', dateFrom: '2026-01-01', dateTo: '2026-01-31' });
      expect(auditService.queryActivityLogs).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ action: 'LOGIN', dateFrom: '2026-01-01', dateTo: '2026-01-31' }),
      );
    });
  });

  // ─── Notifications ──────────────────────────────────────
  describe('notifications.list', () => {
    it('lists the caller notifications with unread filter', async () => {
      notificationService.getUserNotifications.mockResolvedValue({ items: [] });
      await caller.notifications.list({ unreadOnly: true });
      expect(notificationService.getUserNotifications).toHaveBeenCalledWith(TENANT, USER, 1, 20, true);
    });
  });

  describe('notifications.unreadCount', () => {
    it('returns the caller unread count', async () => {
      notificationService.getUnreadCount.mockResolvedValue(4);
      const result = await caller.notifications.unreadCount();
      expect(notificationService.getUnreadCount).toHaveBeenCalledWith(TENANT, USER);
      expect(result).toBe(4);
    });
  });

  describe('notifications.markAsRead', () => {
    it('marks one notification read', async () => {
      notificationService.markAsRead.mockResolvedValue({ read: true });
      await caller.notifications.markAsRead({ notificationId: ID_A });
      expect(notificationService.markAsRead).toHaveBeenCalledWith(TENANT, ID_A, USER);
    });
  });

  describe('notifications.markAllAsRead', () => {
    it('marks all of the caller notifications read', async () => {
      notificationService.markAllAsRead.mockResolvedValue({ updated: 3 });
      const result = await caller.notifications.markAllAsRead();
      expect(notificationService.markAllAsRead).toHaveBeenCalledWith(TENANT, USER);
      expect(result).toEqual({ updated: 3 });
    });
  });

  describe('notifications.delete', () => {
    it('deletes one notification for the caller', async () => {
      notificationService.deleteNotification.mockResolvedValue({ deleted: true });
      await caller.notifications.delete({ notificationId: ID_B });
      expect(notificationService.deleteNotification).toHaveBeenCalledWith(TENANT, ID_B, USER);
    });
  });

  // ─── i18n ───────────────────────────────────────────────
  describe('i18n.locales', () => {
    it('is readable without authentication', async () => {
      i18nService.getSupportedLocales.mockReturnValue(['en', 'hi']);
      const anonymous = routerInstance.router.createCaller({});
      const result = await anonymous.i18n.locales();
      expect(i18nService.getSupportedLocales).toHaveBeenCalledWith();
      expect(result).toEqual(['en', 'hi']);
    });
  });

  describe('i18n.namespaces', () => {
    it('lists translation namespaces', async () => {
      i18nService.getNamespaces.mockReturnValue(['common']);
      const result = await caller.i18n.namespaces();
      expect(i18nService.getNamespaces).toHaveBeenCalledWith();
      expect(result).toEqual(['common']);
    });
  });

  describe('i18n.translations', () => {
    it('returns translations for a namespace with default locale en', async () => {
      i18nService.getTranslationsByNamespace.mockReturnValue({ save: 'Save' });
      const result = await caller.i18n.translations({ namespace: 'common' });
      expect(i18nService.getTranslationsByNamespace).toHaveBeenCalledWith('common', 'en');
      expect(result).toEqual({ save: 'Save' });
    });
  });

  describe('i18n.list', () => {
    it('lists translation keys with paging defaults', async () => {
      i18nService.listTranslationKeys.mockResolvedValue({ items: [] });
      await caller.i18n.list({ namespace: 'common', search: 'save' });
      expect(i18nService.listTranslationKeys).toHaveBeenCalledWith(1, 50, 'common', 'save');
    });
  });

  describe('i18n.create', () => {
    it('creates a translation key', async () => {
      i18nService.createTranslationKey.mockResolvedValue({ id: ID_A });
      const input = { namespace: 'common', key: 'save', defaultValue: 'Save' };
      await caller.i18n.create(input);
      expect(i18nService.createTranslationKey).toHaveBeenCalledWith(input);
    });
  });

  describe('i18n.update', () => {
    it('updates a key without its id', async () => {
      i18nService.updateTranslationKey.mockResolvedValue({ id: ID_A });
      await caller.i18n.update({ id: ID_A, defaultValue: 'Save changes' });
      expect(i18nService.updateTranslationKey).toHaveBeenCalledWith(ID_A, { defaultValue: 'Save changes' });
    });
  });

  describe('i18n.delete', () => {
    it('deletes a translation key', async () => {
      i18nService.deleteTranslationKey.mockResolvedValue({ deleted: true });
      await caller.i18n.delete({ id: ID_C });
      expect(i18nService.deleteTranslationKey).toHaveBeenCalledWith(ID_C);
    });
  });

  describe('i18n.bulkUpdate', () => {
    it('bulk-updates translations for a namespace and locale', async () => {
      i18nService.bulkUpdateTranslations.mockResolvedValue({ updated: 1 });
      await caller.i18n.bulkUpdate({
        namespace: 'common',
        locale: 'hi',
        translations: { save: 'सहेजें' },
      });
      expect(i18nService.bulkUpdateTranslations).toHaveBeenCalledWith('common', 'hi', { save: 'सहेजें' });
    });
  });

  // ─── Authentication and RBAC ────────────────────────────
  describe('authorisation', () => {
    it('rejects unauthenticated callers on protected procedures', async () => {
      const anonymous = routerInstance.router.createCaller({});
      await expect(anonymous.roles.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      expect(roleService.listRoles).not.toHaveBeenCalled();
    });

    it('rejects non-admin callers on sensitive user administration', async () => {
      const staff = routerInstance.router.createCaller({
        tenantId: TENANT,
        userId: USER,
        userPermissions: ['retail.sale.read'],
      });
      await expect(staff.users.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(userService.listUsers).not.toHaveBeenCalled();
    });
  });
});
