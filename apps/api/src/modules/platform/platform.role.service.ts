import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { TenantAwareService } from '../../common/base.service';
import { PrismaService } from '../../common/prisma.service';
import type { AuditMeta } from '@caratflow/shared-types';
import { DEFAULT_PERMISSIONS } from '@caratflow/db';
import { ADMIN_ROLE_NAME, assertNotLastActiveAdmin } from './platform.admin-guard';

interface CreateRoleInput {
  name: string;
  description?: string;
  permissions: string[]; // Array of permission strings like "inventory.item.create"
}

interface UpdateRoleInput {
  name?: string;
  description?: string;
  permissions?: string[];
}



@Injectable()
export class PlatformRoleService extends TenantAwareService {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /** Seed the global permission catalog on first boot. Idempotent. */
  async seedDefaultPermissions(): Promise<{ created: number; existing: number }> {
    let created = 0;
    let existing = 0;

    for (const perm of DEFAULT_PERMISSIONS) {
      const exists = await this.prisma.permission.findUnique({
        where: { module_resource_action: { module: perm.module, resource: perm.resource, action: perm.action } },
      });
      if (exists) {
        existing++;
        continue;
      }
      await this.prisma.permission.create({
        data: {
          id: uuid(),
          module: perm.module,
          resource: perm.resource,
          action: perm.action,
          description: perm.description,
        },
      });
      created++;
    }

    return { created, existing };
  }

  /** Get all permissions from the global catalog, grouped by module. */
  async getAllPermissions(): Promise<Record<string, Array<{ resource: string; action: string; description: string | null }>>> {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { resource: 'asc' }, { action: 'asc' }],
    });

    const grouped: Record<string, Array<{ resource: string; action: string; description: string | null }>> = {};
    for (const p of permissions) {
      const bucket = grouped[p.module] ?? (grouped[p.module] = []);
      bucket.push({ resource: p.resource, action: p.action, description: p.description });
    }

    return grouped;
  }

  /** Create a new role with a set of permissions. */
  async createRole(tenantId: string, input: CreateRoleInput, audit: AuditMeta) {
    const existing = await this.prisma.role.findUnique({
      where: { tenantId_name: { tenantId, name: input.name } },
    });
    if (existing) {
      throw new ConflictException(`Role "${input.name}" already exists`);
    }

    // Convert permission strings array to structured JSON for Role.permissions
    const permissionsJson = this.permissionsArrayToJson(input.permissions);

    return this.prisma.role.create({
      data: {
        id: uuid(),
        tenantId,
        name: input.name,
        description: input.description ?? null,
        permissions: permissionsJson,
        isSystem: false,
        createdBy: audit.userId,
      },
    });
  }

  /** Update an existing role. */
  async updateRole(tenantId: string, roleId: string, input: UpdateRoleInput, audit: AuditMeta) {
    const role = await this.prisma.role.findFirst({
      where: this.tenantWhere(tenantId, { id: roleId }),
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    if (role.isSystem) {
      throw new BadRequestException('Cannot modify a system role');
    }

    if (input.name && input.name !== role.name) {
      const nameConflict = await this.prisma.role.findUnique({
        where: { tenantId_name: { tenantId, name: input.name } },
      });
      if (nameConflict) {
        throw new ConflictException(`Role "${input.name}" already exists`);
      }
    }

    const data: Record<string, unknown> = { updatedBy: audit.userId };
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.permissions !== undefined) {
      data.permissions = this.permissionsArrayToJson(input.permissions);
    }

    return this.prisma.role.update({
      where: { id: roleId },
      data,
    });
  }

  /** Delete a role (must not be a system role, must not have active users). */
  async deleteRole(tenantId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: this.tenantWhere(tenantId, { id: roleId }),
      include: { _count: { select: { users: true } } },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    if (role.isSystem) {
      throw new BadRequestException('Cannot delete a system role');
    }
    if (role._count.users > 0) {
      throw new BadRequestException(`Cannot delete role with ${role._count.users} active user(s). Reassign them first.`);
    }

    await this.prisma.role.delete({ where: { id: roleId } });
    return { success: true };
  }

  /** List roles for a tenant. */
  async listRoles(tenantId: string) {
    return this.prisma.role.findMany({
      where: { tenantId },
      include: { _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
  }

  /** Get a single role with permissions detail. */
  async getRoleById(tenantId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: this.tenantWhere(tenantId, { id: roleId }),
      include: { _count: { select: { users: true } } },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  /** Assign a role to a user. */
  async assignRoleToUser(tenantId: string, userId: string, roleId: string, audit: AuditMeta) {
    const role = await this.prisma.role.findFirst({
      where: this.tenantWhere(tenantId, { id: roleId }),
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const user = await this.prisma.user.findFirst({
      where: this.tenantWhere(tenantId, { id: userId }),
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (role.name !== ADMIN_ROLE_NAME) {
      await assertNotLastActiveAdmin(this.prisma, tenantId, userId, 'demote');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { roleId, updatedBy: audit.userId },
      select: { id: true, email: true, roleId: true },
    });
  }

  /** Check if a user has a specific permission. Used by PermissionGuard. */
  async checkPermission(tenantId: string, userId: string, requiredPermission: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: this.tenantWhere(tenantId, { id: userId }),
      include: { role: true },
    });
    if (!user || !user.role) return false;

    const permissions = this.extractPermissionStrings(user.role.permissions);
    return permissions.some((p) => {
      if (p === '*') return true;
      if (p === requiredPermission) return true;
      if (p.endsWith('.*') && requiredPermission.startsWith(p.slice(0, -2))) return true;
      return false;
    });
  }

  // ─── Private Helpers ─────────────────────────────────────────

  /**
   * Convert flat permission strings to the JSON format stored in Role.permissions.
   * Input: ["inventory.item.create", "inventory.item.read", "retail.sale.create"]
   * Output: { "inventory.item": ["create", "read"], "retail.sale": ["create"] }
   */
  private permissionsArrayToJson(permissions: string[]): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const perm of permissions) {
      const parts = perm.split('.');
      if (parts.length < 3) continue;
      const key = parts.slice(0, -1).join('.');
      const action = parts[parts.length - 1];
      if (!action) continue;
      const bucket = result[key] ?? (result[key] = []);
      if (!bucket.includes(action)) bucket.push(action);
    }
    return result;
  }

  /** Extract flat permission strings from role's JSON format. */
  private extractPermissionStrings(permissionsJson: unknown): string[] {
    if (!permissionsJson || typeof permissionsJson !== 'object') return [];
    const result: string[] = [];
    for (const [key, value] of Object.entries(permissionsJson as Record<string, unknown>)) {
      if (key === '*') {
        result.push('*');
        continue;
      }
      if (Array.isArray(value)) {
        for (const action of value) {
          result.push(`${key}.${action}`);
        }
      } else {
        result.push(key);
      }
    }
    return result;
  }
}
