export interface Store {
  /**
   * Returns the value indexed at key
   * @param key
   */
  getItem(key: string): Promise<ArrayBuffer | undefined>
  /**
   * Adds a value into key store
   * @param key The index of the value
   * @param value The type and value
   */
  setItem(key: string, value: ArrayBuffer): Promise<ArrayBuffer>
  /**
   * Remove the value indexed at key
   * @param key
   */
  removeItem(key: string): Promise<void>
  /**
   * Reset all data stored within store
   */
  clear(): Promise<void>
}

export class KeyStore implements Store {
  #secrets: Record<string, ArrayBuffer> = {}

  private async addSecret(keyId: string, value: ArrayBuffer): Promise<void> {
    this.#secrets[keyId] = value
  }

  public async setItem(key: string, value: ArrayBuffer): Promise<ArrayBuffer> {
    await this.addSecret(key, value)
    return value
  }

  public async getItem(key: string): Promise<ArrayBuffer | undefined> {
    return this.#secrets[key]
  }

  public async removeItem(key: string): Promise<void> {
    delete this.#secrets[key]
  }

  public async clear(): Promise<void> {
    this.#secrets = {}
  }
}
