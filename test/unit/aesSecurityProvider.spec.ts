import { DefaultKeyManager } from "../../src/core/key-manager"
import { KeyStore } from "../../src/core/key-store"
import { AesSecurityProvider } from "../../src/security/aesSecurityProvider"
import { SecurityProviderBase } from "../../src/security/securityProvider"
import { KeyStoreException } from '../../src/global/error'

global.crypto = require('isomorphic-webcrypto')

describe('AesSecurityProvider', () => {
  const symmetricKeyId = '1234'
  const symmetricKey = '14A9B3C3540142A11E70ACBB1BD8969F'
  const keyManager = new DefaultKeyManager(new KeyStore())
  keyManager.setSymmetricKeyId(symmetricKeyId)
  keyManager.insertKey(symmetricKeyId, new TextEncoder().encode(symmetricKey))

  const provider = new SecurityProviderBase(keyManager)
  const aesSecurityProvider = new AesSecurityProvider(keyManager)

  it('Generate random data', () => {
    const data1 = provider.generateRandomData(10)
    const data2 = provider.generateRandomData(10)
    const data3 = provider.generateRandomData(20)
    expect(data1.byteLength).toBe(10)
    expect(data2.byteLength).toBe(10)
    expect(data3.byteLength).toBe(20)
    expect(Buffer.from(data1).toString('hex')).not.toBe(
      Buffer.from(data2).toString('hex'),
    )
  })

  it('should get symmetric key when set', async () => {
    const buffer = provider.getSymmetricKey(symmetricKeyId)

    expect(buffer).toBeDefined()
  })

  it('should throw KeyStoreException when symmetric key not set', async () => {
    const provider = new SecurityProviderBase(new DefaultKeyManager(new KeyStore()))

    expect(async () => { await provider.getSymmetricKey(symmetricKeyId) } ).rejects.toThrow(KeyStoreException)
  })

  it('should encrypt then decrypt', async () => {

    const encrypted = await aesSecurityProvider.encrypt(symmetricKeyId, new TextEncoder().encode('Homer'))

    const decrypted = await aesSecurityProvider.decrypt(symmetricKeyId, encrypted)

    const data = new TextDecoder().decode(decrypted)

    expect(data).toEqual('Homer')
  })
})