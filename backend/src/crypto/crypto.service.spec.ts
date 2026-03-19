import { Test } from '@nestjs/testing';
import { CryptoService } from './crypto.service';

const mockKms = {
  send: jest.fn(),
};

jest.mock('@aws-sdk/client-kms', () => ({
  KMSClient: jest.fn(() => mockKms),
  EncryptCommand: jest.fn((input) => ({ input })),
  DecryptCommand: jest.fn((input) => ({ input })),
}));

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.KMS_KEY_ID = 'test-key-id';
    const module = await Test.createTestingModule({
      providers: [CryptoService],
    }).compile();
    service = module.get(CryptoService);
  });

  describe('encrypt', () => {
    it('encrypts a plaintext string and returns base64 with prefix', async () => {
      const cipherBlob = Buffer.from('encrypted-bytes');
      mockKms.send.mockResolvedValue({ CiphertextBlob: cipherBlob });

      const result = await service.encrypt('my-secret');

      expect(mockKms.send).toHaveBeenCalledTimes(1);
      expect(result).toBe(`enc:${cipherBlob.toString('base64')}`);
    });

    it('returns empty string for empty input', async () => {
      const result = await service.encrypt('');
      expect(result).toBe('');
      expect(mockKms.send).not.toHaveBeenCalled();
    });
  });

  describe('decrypt', () => {
    it('decrypts an enc:-prefixed string back to plaintext', async () => {
      const plaintext = Buffer.from('my-secret');
      mockKms.send.mockResolvedValue({ Plaintext: plaintext });

      const cipherBase64 = Buffer.from('encrypted-bytes').toString('base64');
      const result = await service.decrypt(`enc:${cipherBase64}`);

      expect(mockKms.send).toHaveBeenCalledTimes(1);
      expect(result).toBe('my-secret');
    });

    it('returns non-prefixed strings as-is (plaintext passthrough)', async () => {
      const result = await service.decrypt('already-plaintext');
      expect(result).toBe('already-plaintext');
      expect(mockKms.send).not.toHaveBeenCalled();
    });

    it('returns empty string for empty input', async () => {
      const result = await service.decrypt('');
      expect(result).toBe('');
      expect(mockKms.send).not.toHaveBeenCalled();
    });
  });
});
