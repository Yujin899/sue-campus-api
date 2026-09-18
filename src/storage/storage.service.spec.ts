import { buildAttachmentDisposition } from './storage.service';

describe('buildAttachmentDisposition', () => {
  it('builds an attachment disposition for a plain file name', () => {
    expect(buildAttachmentDisposition('notes.pdf')).toBe(
      `attachment; filename="notes.pdf"; filename*=UTF-8''notes.pdf`,
    );
  });

  it('sanitizes quotes and backslashes in the fallback', () => {
    const result = buildAttachmentDisposition('a"b\\c.pdf');
    expect(result).toContain('filename="a_b_c.pdf"');
    expect(result).toContain(
      `filename*=UTF-8''${encodeURIComponent('a"b\\c.pdf')}`,
    );
  });

  it('encodes non-ascii names with an ascii fallback', () => {
    const name = 'محاضرة.pdf';
    const fallback = name.replace(/[^\x20-\x7E]/g, '_');
    expect(buildAttachmentDisposition(name)).toBe(
      `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    );
  });
});
