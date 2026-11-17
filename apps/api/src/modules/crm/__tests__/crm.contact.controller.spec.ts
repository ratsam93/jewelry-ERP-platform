import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CrmContactController, ContactEnquiryDto } from '../crm.contact.controller';

const TENANT = '69544f8e-fa3c-40b4-8975-643825600ce7';
const valid = {
  name: 'Rajesh Kumar',
  email: 'rajesh@example.com',
  phone: '+91 98765 43210',
  message: 'Interested in a demo',
  source: 'marketing-site',
  website: '',
};

const req = (tenant?: string) => ({ headers: tenant ? { 'x-tenant-id': tenant } : {} }) as never;
const errorsFor = async (o: object) => validate(plainToInstance(ContactEnquiryDto, o));
const props = (errs: Array<{ property: string }>) => errs.map((e) => e.property);

describe('CrmContactController', () => {
  let leadService: { createLead: ReturnType<typeof vi.fn> };
  let controller: CrmContactController;

  beforeEach(() => {
    leadService = { createLead: vi.fn().mockResolvedValue({ id: 'l1' }) };
    controller = new CrmContactController(leadService as never);
  });

  it('creates a lead and returns success for a valid enquiry', async () => {
    const res = await controller.submit(req(TENANT), valid as never);
    expect(res).toEqual({ success: true });
    expect(leadService.createLead).toHaveBeenCalledTimes(1);
    const [tenant, , input] = leadService.createLead.mock.calls[0]!;
    expect(tenant).toBe(TENANT);
    expect(input).toMatchObject({ firstName: 'Rajesh', lastName: 'Kumar', email: 'rajesh@example.com', source: 'WEBSITE' });
    expect(input.notes).toContain('Interested in a demo');
    expect(input.notes).toContain('[Website contact form]');
  });

  it('silently ignores submissions with a filled honeypot', async () => {
    const res = await controller.submit(req(TENANT), { ...valid, website: 'http://spam.test' } as never);
    expect(res).toEqual({ success: true });
    expect(leadService.createLead).not.toHaveBeenCalled();
  });

  it('rejects a missing tenant header', async () => {
    await expect(controller.submit(req(), valid as never)).rejects.toThrow(BadRequestException);
    expect(leadService.createLead).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID tenant header', async () => {
    await expect(controller.submit(req('not-a-uuid'), valid as never)).rejects.toThrow(BadRequestException);
  });

  it('DTO accepts a valid payload', async () => {
    expect(await errorsFor(valid)).toHaveLength(0);
  });

  it('DTO rejects an invalid email', async () => {
    expect(props(await errorsFor({ ...valid, email: 'nope' }))).toContain('email');
  });

  it('DTO rejects a message over 2000 chars and an empty message', async () => {
    expect(props(await errorsFor({ ...valid, message: 'x'.repeat(2001) }))).toContain('message');
    expect(props(await errorsFor({ ...valid, message: '' }))).toContain('message');
  });

  it('DTO rejects a name over 100 chars and a bad phone', async () => {
    expect(props(await errorsFor({ ...valid, name: 'x'.repeat(101) }))).toContain('name');
    expect(props(await errorsFor({ ...valid, phone: 'abc' }))).toContain('phone');
  });

  it('is throttled to 5 requests per minute', () => {
    const limit = Reflect.getMetadata('THROTTLER:LIMITdefault', CrmContactController.prototype.submit);
    expect(limit).toBe(5);
  });
});
