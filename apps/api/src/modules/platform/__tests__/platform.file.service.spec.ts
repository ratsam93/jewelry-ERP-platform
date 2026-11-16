import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PlatformFileService } from '../platform.file.service';
import {
  createMockPrismaService,
  TEST_TENANT_ID,
  TEST_USER_ID,
} from '../../../__tests__/setup';

function extendPrisma(base: ReturnType<typeof createMockPrismaService>) {
  return {
    ...base,
    fileUpload: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const PDF_BYTES = Buffer.from('%PDF-1.4\n%fake\n');

describe('PlatformFileService (Unit)', () => {
  let service: PlatformFileService;
  let mockPrisma: ReturnType<typeof extendPrisma>;

  beforeEach(() => {
    mockPrisma = extendPrisma(createMockPrismaService());
    service = new PlatformFileService(mockPrisma as any);
  });

  describe('uploadFile', () => {
    it('creates file metadata after upload', async () => {
      mockPrisma.fileUpload.create.mockResolvedValue({
        id: 'f-1',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: JPEG_BYTES.length,
      });

      const result = await service.uploadFile(TEST_TENANT_ID, {
        fileName: 'photo.jpg',
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        buffer: JPEG_BYTES,
      }, TEST_USER_ID);

      expect(result.fileName).toBe('photo.jpg');
      expect(mockPrisma.fileUpload.create).toHaveBeenCalledOnce();
    });

    it('rejects image/svg+xml', async () => {
      await expect(
        service.uploadFile(TEST_TENANT_ID, {
          fileName: 'logo.svg',
          originalName: 'logo.svg',
          mimeType: 'image/svg+xml',
          sizeBytes: 10,
          buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        }, TEST_USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects content whose magic bytes do not match the declared type', async () => {
      await expect(
        service.uploadFile(TEST_TENANT_ID, {
          fileName: 'fake.jpg',
          originalName: 'fake.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: PNG_BYTES.length,
          buffer: PNG_BYTES,
        }, TEST_USER_ID),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.fileUpload.create).not.toHaveBeenCalled();
    });

    it('rejects non-sniffable types whose content has a known binary signature', async () => {
      await expect(
        service.uploadFile(TEST_TENANT_ID, {
          fileName: 'data.csv',
          originalName: 'data.csv',
          mimeType: 'text/csv',
          sizeBytes: PDF_BYTES.length,
          buffer: PDF_BYTES,
        }, TEST_USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('uses buffer length, not client-supplied sizeBytes, for metadata', async () => {
      mockPrisma.fileUpload.create.mockResolvedValue({ id: 'f-2' });
      await service.uploadFile(TEST_TENANT_ID, {
        fileName: 'doc.pdf',
        originalName: 'doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1,
        buffer: PDF_BYTES,
      }, TEST_USER_ID);
      const data = mockPrisma.fileUpload.create.mock.calls[0]?.[0]?.data as { sizeBytes: number };
      expect(data.sizeBytes).toBe(PDF_BYTES.length);
    });

    it('builds a storage key from tenant, safe folder, UUID and MIME-derived extension', async () => {
      mockPrisma.fileUpload.create.mockResolvedValue({ id: 'f-3' });
      await service.uploadFile(TEST_TENANT_ID, {
        fileName: 'x.png',
        originalName: '../../evil.exe',
        mimeType: 'image/png',
        sizeBytes: PNG_BYTES.length,
        buffer: PNG_BYTES,
        folder: '../Bad Folder',
      }, TEST_USER_ID);
      const data = mockPrisma.fileUpload.create.mock.calls[0]?.[0]?.data as { storageKey: string };
      expect(data.storageKey).toMatch(
        new RegExp('^' + TEST_TENANT_ID + '/general/[0-9a-f-]{36}\\.png$'),
      );
      expect(data.storageKey).not.toContain('evil');
    });

    it('rejects disallowed MIME types', async () => {
      await expect(
        service.uploadFile(TEST_TENANT_ID, {
          fileName: 'script.js',
          originalName: 'script.js',
          mimeType: 'application/javascript',
          sizeBytes: 100,
          buffer: Buffer.from('bad'),
        }, TEST_USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects files exceeding max size based on the actual buffer', async () => {
      await expect(
        service.uploadFile(TEST_TENANT_ID, {
          fileName: 'huge.pdf',
          originalName: 'huge.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1, // client-supplied value is ignored
          buffer: Buffer.concat([PDF_BYTES, Buffer.alloc(50 * 1024 * 1024)]),
        }, TEST_USER_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getPresignedUrl', () => {
    it('returns a URL and expiry date', async () => {
      mockPrisma.fileUpload.findFirst.mockResolvedValue({
        id: 'f-1',
        storageKey: 'tenant/general/f-1.jpg',
      });

      const result = await service.getPresignedUrl(TEST_TENANT_ID, 'f-1');
      expect(result.url).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException when file not found', async () => {
      mockPrisma.fileUpload.findFirst.mockResolvedValue(null);
      await expect(
        service.getPresignedUrl(TEST_TENANT_ID, 'bad'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteFile', () => {
    it('deletes file metadata and storage', async () => {
      mockPrisma.fileUpload.findFirst.mockResolvedValue({
        id: 'f-1',
        storageKey: 'key',
      });
      mockPrisma.fileUpload.delete.mockResolvedValue({});

      const result = await service.deleteFile(TEST_TENANT_ID, 'f-1');
      expect(result.success).toBe(true);
    });

    it('throws NotFoundException for missing file', async () => {
      mockPrisma.fileUpload.findFirst.mockResolvedValue(null);
      await expect(service.deleteFile(TEST_TENANT_ID, 'bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('linkFileToEntity', () => {
    it('links a file to an entity', async () => {
      mockPrisma.fileUpload.findFirst.mockResolvedValue({ id: 'f-1' });
      mockPrisma.fileUpload.update.mockResolvedValue({ id: 'f-1', entityType: 'product', entityId: 'p-1' });

      const result = await service.linkFileToEntity(TEST_TENANT_ID, 'f-1', 'product', 'p-1');
      expect(result.entityType).toBe('product');
    });

    it('throws NotFoundException when file not found', async () => {
      mockPrisma.fileUpload.findFirst.mockResolvedValue(null);
      await expect(
        service.linkFileToEntity(TEST_TENANT_ID, 'bad', 'product', 'p-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getFilesForEntity', () => {
    it('returns files linked to an entity', async () => {
      mockPrisma.fileUpload.findMany.mockResolvedValue([{ id: 'f-1' }, { id: 'f-2' }]);

      const result = await service.getFilesForEntity(TEST_TENANT_ID, 'product', 'p-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('getFileById', () => {
    it('returns file metadata', async () => {
      mockPrisma.fileUpload.findFirst.mockResolvedValue({ id: 'f-1', fileName: 'doc.pdf' });
      const result = await service.getFileById(TEST_TENANT_ID, 'f-1');
      expect(result.fileName).toBe('doc.pdf');
    });

    it('throws NotFoundException if not found', async () => {
      mockPrisma.fileUpload.findFirst.mockResolvedValue(null);
      await expect(service.getFileById(TEST_TENANT_ID, 'bad')).rejects.toThrow(NotFoundException);
    });
  });
});
