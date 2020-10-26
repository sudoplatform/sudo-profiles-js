import { Store } from './key-store'

export const KEY_NAME_SYMMETRIC_KEY_ID: string = 'symmetricKeyId'

type KeyImport = { keyId: string; value: string }

/**
 * A Key Manager to store secret keys used to encrypt and decrypt data
 */
export interface KeyManager {
  /**
   * Sets the default symmetric key Id
   *
   * @param keyId The keyId that points to the symmetric key
   */
  setSymmetricKeyId(keyId: string): Promise<void>

  /**
   * Gets the default symmetric keyId
   */
  getSymmetricKeyId(): Promise<string | undefined>

  /**
   * Adds a string value into key manager
   *
   * @param keyId Represents the `index` of the value
   * @param value The type and value
   */
  insertKey(keyId: string, value: ArrayBuffer): Promise<void>

  /**
   * Returns the string value indexed at keyId
   *
   * @param keyId
   */
  getKey(keyId: string): Promise<ArrayBuffer | undefined>

  /**
   * Remove the string value indexed at keyId
   *
   * @param keyId
   */
  deleteKey(keyId: string): Promise<void>

  /**
   * Reset all data stored within the secrets store
   */
  reset(): Promise<void>
}

export class DefaultKeyManager implements KeyManager {
  private readonly _store: Store

  constructor(keyStore: Store) {
    this._store = keyStore
  }

  public async setSymmetricKeyId(keyId: string): Promise<void> {
    const textEncoder = new TextEncoder()
    await this._store.setItem(
      KEY_NAME_SYMMETRIC_KEY_ID,
      textEncoder.encode(keyId),
    )
  }

  public async getSymmetricKeyId(): Promise<string | undefined> {
    const keyId = await this._store.getItem(KEY_NAME_SYMMETRIC_KEY_ID)
    const textDecoder = new TextDecoder()
    return textDecoder.decode(keyId)
  }

  public async insertKey(keyId: string, value: ArrayBuffer): Promise<void> {
    await this._store.setItem(keyId, value)
    new Uint8Array(value).fill(0)
  }

  public async getKey(keyId: string): Promise<ArrayBuffer | undefined> {
    return await this._store.getItem(keyId)
  }

  public async deleteKey(keyId: string): Promise<void> {
    await this._store.removeItem(keyId)
  }

  public async reset(): Promise<void> {
    await this._store.clear()
  }
}
