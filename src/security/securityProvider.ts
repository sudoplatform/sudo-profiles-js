import { KeyManager } from '../core/key-manager'
import { KeyStoreException } from '../global/error'

export enum SymmetricKeyEncryptionAlgorithm {
  AesCbcPkcs7Padding = 'AES/CBC/PKCS7Padding',
}

/**
 * Interface to be implemented by security providers responsible for cryptographic
 * and key management operations.
 */
export interface SecurityProvider {
  /**
   * Encrypts the specified data
   *
   * @param keyId
   * @param data
   *
   * @returns Encrypted data and IV
   *
   * @throws {@link KeyStoreException}
   */
  encrypt(keyId: string, data: ArrayBuffer): Promise<ArrayBuffer>

  /**
   * Decrypts the specified data
   *
   * @param keyId
   * @param data
   *
   * @returns Decrypted data
   *
   * @throw {@link KeyStoreException}
   */
  decrypt(keyId: string, data: ArrayBuffer): Promise<ArrayBuffer>
}

/**
 * Base class for Security Provider implementations
 */
export class SecurityProviderBase {
  constructor(private keyManager: KeyManager) {}

  public async getSymmetricKey(keyId: string): Promise<ArrayBuffer> {
    const key = await this.keyManager.getKey(keyId)
    if (!key) {
      throw new KeyStoreException('Symmetric key not found.')
    }

    return key
  }

  public generateRandomData(size: number): ArrayBuffer {
    const buffer = new ArrayBuffer(size)
    crypto.getRandomValues(new Uint8Array(buffer))
    return buffer
  }
}
