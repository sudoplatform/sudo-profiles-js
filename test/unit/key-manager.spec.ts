import { DefaultKeyManager } from "../../src/core/key-manager"
import { InMemoryKeyStore } from "../../src/core/key-store"

describe('keyManager', () => {
  
  it('should delete', async () => {
    const keyManager = new DefaultKeyManager(new InMemoryKeyStore())
    const keyId = '1234'
    const value = 'some data'
    await keyManager.insertKey(keyId, new TextEncoder().encode(value))
    const getValue = await keyManager.getKey(keyId)

    expect(new TextDecoder().decode(getValue)).toBe(value)

    await keyManager.deleteKey(keyId)

    const getDeletedValue = await keyManager.getKey(keyId)

    expect(getDeletedValue).toBeFalsy()
  })

  it('should clear all data', async () => {
    const keyManager = new DefaultKeyManager(new InMemoryKeyStore())
   
    await keyManager.insertKey('1234', new TextEncoder().encode('some data'))
    await keyManager.insertKey('5678', new TextEncoder().encode('more data'))

    await keyManager.reset()
    const data = await keyManager.getKey('1234')
    expect(data).toBeFalsy()

  })
})