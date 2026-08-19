import { describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

const { lookup } = await import('node:dns/promises');
const { assertPublicHttpsUrl } = await import('./url-safety');

const mockLookup = vi.mocked(lookup);

describe('assertPublicHttpsUrl', () => {
  it('rejects a non-URL string', async () => {
    await expect(assertPublicHttpsUrl('not a url')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects plain http', async () => {
    await expect(assertPublicHttpsUrl('http://example.com')).rejects.toThrow('https');
  });

  it('accepts a host that resolves to a public address', async () => {
    // @ts-expect-error - vitest's mock typing does not fully match dns.lookup's overloads
    mockLookup.mockResolvedValue([{ address: '203.0.113.10', family: 4 }]);
    await expect(assertPublicHttpsUrl('https://api.example.com/v1')).resolves.toBeUndefined();
  });

  it('rejects loopback', async () => {
    // @ts-expect-error - see above
    mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(assertPublicHttpsUrl('https://sneaky.example.com')).rejects.toThrow('private');
  });

  it('rejects the cloud metadata address specifically', async () => {
    // @ts-expect-error - see above
    mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    await expect(assertPublicHttpsUrl('https://sneaky.example.com')).rejects.toThrow('private');
  });

  it('rejects 10.x, 172.16-31.x, and 192.168.x private ranges', async () => {
    for (const address of ['10.0.0.5', '172.20.0.5', '192.168.1.1']) {
      // @ts-expect-error - see above
      mockLookup.mockResolvedValue([{ address, family: 4 }]);
      await expect(assertPublicHttpsUrl('https://sneaky.example.com')).rejects.toThrow('private');
    }
  });

  it('rejects IPv6 loopback and unique-local', async () => {
    for (const address of ['::1', 'fd00::1', 'fe80::1']) {
      // @ts-expect-error - see above
      mockLookup.mockResolvedValue([{ address, family: 6 }]);
      await expect(assertPublicHttpsUrl('https://sneaky.example.com')).rejects.toThrow('private');
    }
  });

  it('rejects if ANY resolved address is private, not just the first', async () => {
    mockLookup.mockResolvedValue([
      // @ts-expect-error - see above
      { address: '203.0.113.10', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(assertPublicHttpsUrl('https://sneaky.example.com')).rejects.toThrow('private');
  });

  it('rejects an unresolvable host', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(assertPublicHttpsUrl('https://does-not-exist.invalid')).rejects.toThrow(
      'resolve',
    );
  });
});
