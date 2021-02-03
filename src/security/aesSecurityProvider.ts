import { KeyManager } from '../core/key-manager'
import { SecurityProvider, SecurityProviderBase } from './securityProvider'
import { Buffer } from '../utils/buffer'

export class AesSecurityProvider
  extends SecurityProviderBase
  implements SecurityProvider {
  private ivSize = 16
  private algorithmName = 'AES-CBC'

  constructor(keyManager: KeyManager) {
    super(keyManager)
  }

  public async encrypt(keyId: string, data: ArrayBuffer): Promise<ArrayBuffer> {
    const key = await this.getSymmetricKey(keyId)
    const iv = this.generateRandomData(this.ivSize)

    const secretKey = await crypto.subtle.importKey(
      'raw',
      key,
      this.algorithmName,
      false,
      ['encrypt'],
    )

    const encrypted = await crypto.subtle.encrypt(
      {
        name: this.algorithmName,
        iv,
      },
      secretKey,
      data,
    )

    new Uint8Array(key).fill(0)

    return Buffer.concat(encrypted, iv)
  }

  public async decrypt(keyId: string, data: ArrayBuffer): Promise<ArrayBuffer> {
    const key = await this.getSymmetricKey(keyId)

    const encryptedData = data.slice(0, data.byteLength - this.ivSize)
    const iv = data.slice(data.byteLength - this.ivSize)

    const secretKey = await crypto.subtle.importKey(
      'raw',
      key,
      this.algorithmName,
      false,
      ['decrypt'],
    )

    const decrypted = await crypto.subtle.decrypt(
      {
        name: this.algorithmName,
        iv,
      },
      secretKey,
      encryptedData,
    )

    new Uint8Array(key).fill(0)

    return decrypted
  }
}
