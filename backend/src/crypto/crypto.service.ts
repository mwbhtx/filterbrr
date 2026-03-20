import { Injectable } from '@nestjs/common';
import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';

const ENC_PREFIX = 'enc:';

@Injectable()
export class CryptoService {
  private readonly kms = new KMSClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  private readonly keyId = process.env.KMS_KEY_ID;

  private readonly isLocal = process.env.NODE_ENV === 'local';

  async encrypt(plaintext: string): Promise<string> {
    if (!plaintext || plaintext.startsWith(ENC_PREFIX)) return plaintext;
    if (this.isLocal) return plaintext;
    const result = await this.kms.send(new EncryptCommand({
      KeyId: this.keyId,
      Plaintext: Buffer.from(plaintext),
    }));
    return `${ENC_PREFIX}${Buffer.from(result.CiphertextBlob!).toString('base64')}`;
  }

  async decrypt(ciphertext: string): Promise<string> {
    if (!ciphertext || !ciphertext.startsWith(ENC_PREFIX)) return ciphertext;
    if (this.isLocal) return ciphertext;
    const blob = Buffer.from(ciphertext.slice(ENC_PREFIX.length), 'base64');
    const result = await this.kms.send(new DecryptCommand({
      CiphertextBlob: blob,
    }));
    return Buffer.from(result.Plaintext!).toString('utf-8');
  }
}
