import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma.service';

/** Name of the built-in, unmodifiable administrator role. */
export const ADMIN_ROLE_NAME = 'Admin';

/**
 * Refuse an operation that would leave the tenant without any active Admin.
 * Call BEFORE deactivating a user or moving them off the Admin role.
 * No-op when the target user is not currently an active Admin.
 */
export async function assertNotLastActiveAdmin(
  prisma: PrismaService,
  tenantId: string,
  userId: string,
  action: 'deactivate' | 'demote',
): Promise<void> {
  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { isActive: true, role: { select: { name: true } } },
  });
  if (!target || !target.isActive || target.role?.name !== ADMIN_ROLE_NAME) return;

  const otherAdmins = await prisma.user.count({
    where: {
      tenantId,
      isActive: true,
      id: { not: userId },
      role: { is: { name: ADMIN_ROLE_NAME } },
    },
  });
  if (otherAdmins === 0) {
    throw new BadRequestException(
      action === 'deactivate'
        ? 'Cannot deactivate the last active administrator. Make another user an Admin first.'
        : 'Cannot remove the Admin role from the last active administrator. Make another user an Admin first.',
    );
  }
}
