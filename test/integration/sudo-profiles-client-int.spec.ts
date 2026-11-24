import { DefaultApiClientManager } from '@sudoplatform/sudo-api-client'
import {
  DefaultConfigurationManager,
  DefaultSudoKeyManager,
  IllegalStateError,
  VersionMismatchError,
} from '@sudoplatform/sudo-common'
import { DefaultSudoEntitlementsClient } from '@sudoplatform/sudo-entitlements'
import { DefaultSudoUserClient } from '@sudoplatform/sudo-user'
import {
  AsyncStore,
  WebSudoCryptoProvider,
} from '@sudoplatform/sudo-web-crypto-provider'
import FS from 'fs'
import * as path from 'path'
import { anything, mock, when } from 'ts-mockito'
import { v4 } from 'uuid'
import { TextDecoder, TextEncoder } from 'util'
import { FetchOption, Sudo } from '../../src/sudo/sudo'
import { DefaultSudoProfilesClient } from '../../src/sudo/sudo-profiles-client'
import {
  ChangeType,
  ConnectionState,
  SudoSubscriber,
} from '../../src/sudo/sudo-subscriber'
import { delay, deregister, registerAndSignIn } from './test-helper'

// eslint-disable-next-line @typescript-eslint/no-require-imports
global.WebSocket = require('ws')
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
global.crypto = require('crypto').webcrypto
global.TextEncoder = TextEncoder as typeof global.TextEncoder
global.TextDecoder = TextDecoder as typeof global.TextDecoder
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('isomorphic-fetch')

class MySubscriber implements SudoSubscriber {
  public connectionState: ConnectionState | undefined = undefined
  public changeType: ChangeType | undefined = undefined
  public sudo: Sudo | undefined = undefined

  sudoChanged(changeType: ChangeType, sudo: Sudo): void {
    this.sudo = sudo
    this.changeType = changeType
  }

  connectionStatusChanged(state: ConnectionState): void {
    this.connectionState = state
  }
}

/**
 * In-memory key store that can be shared by several key managers, standing in
 * for a persistent store that outlives a single client instance.
 */
class SharedMemoryStore implements AsyncStore {
  readonly data = new Map<string, unknown>()

  getKeys(): Promise<string[]> {
    return Promise.resolve([...this.data.keys()])
  }
  getItem(key: string): Promise<unknown> {
    return Promise.resolve(this.data.get(key) ?? null)
  }
  setItem(key: string, value: unknown): Promise<void> {
    this.data.set(key, value)
    return Promise.resolve()
  }
  removeItem(key: unknown): Promise<void> {
    this.data.delete(key as string)
    return Promise.resolve()
  }
  clear(): Promise<void> {
    this.data.clear()
    return Promise.resolve()
  }
}

function newKeyManager(
  namespace: string,
  store: AsyncStore,
): DefaultSudoKeyManager {
  return new DefaultSudoKeyManager(
    new WebSudoCryptoProvider(
      namespace,
      'com.sudoplatform.appservicename',
      store,
    ),
  )
}

function newDummySudo(id: string): Sudo {
  const sudo = new Sudo()
  sudo.title = `dummy_title_${id}`
  sudo.firstName = `dummy_first_name_${id}`
  sudo.lastName = `dummy_last_name_${id}`
  sudo.label = `dummy_label_${id}`
  sudo.notes = `dummy_notes_${id}`
  return sudo
}

let sudoEntitlements: DefaultSudoEntitlementsClient
let sudoUser: DefaultSudoUserClient
let sudoProfilesClient: DefaultSudoProfilesClient
let blobCacheMock: LocalForage
let beforeAllComplete = false
let beforeEachComplete = false

beforeAll(() => {
  const sudoPlatformConfigPath =
    process.env.SUDO_PLATFORM_CONFIG ||
    `${__dirname}/../../config/sudoplatformconfig.json`
  const registerKeyPath =
    process.env.REGISTER_KEY || `${__dirname}/../../config/register_key.private`
  const registerKeyIdPath =
    process.env.REGISTER_KEY_ID || `${__dirname}/../../config/register_key.id`

  expect(sudoPlatformConfigPath).toMatch(/.+/)
  expect(registerKeyPath).toMatch(/.+/)
  expect(registerKeyIdPath).toMatch(/.+/)

  const registerKey = FS.readFileSync(registerKeyPath).toString()
  const registerKeyId = FS.readFileSync(registerKeyIdPath).toString().trim()
  const sudoPlatformConfig = FS.readFileSync(sudoPlatformConfigPath).toString()
  expect(registerKey).toMatch(/.+/)
  expect(registerKeyId).toMatch(/.+/)
  DefaultConfigurationManager.getInstance().setConfig(sudoPlatformConfig.trim())

  const configurationManager = DefaultConfigurationManager.getInstance()
  configurationManager.setConfig(sudoPlatformConfig)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const identityServiceConfig: any =
    configurationManager.getConfigSet('identityService')
  expect(identityServiceConfig?.poolId).toBeTruthy()
  if (!identityServiceConfig?.poolId) {
    fail('identityServiceConfig.poolId unexpectedly falsy')
  }

  sudoUser = new DefaultSudoUserClient()
  DefaultApiClientManager.getInstance().setAuthClient(sudoUser)
  sudoEntitlements = new DefaultSudoEntitlementsClient(sudoUser)

  blobCacheMock = mock()

  sudoProfilesClient = new DefaultSudoProfilesClient({
    sudoUserClient: sudoUser,
    blobCache: blobCacheMock,
  })

  beforeAllComplete = true
})

afterAll(() => {
  beforeAllComplete = false
})

beforeEach(async (): Promise<void> => {
  expect({ beforeAllComplete }).toEqual({ beforeAllComplete: true })

  try {
    await registerAndSignIn(sudoUser)
    await sudoEntitlements.redeemEntitlements()

    // Setup symmetric key before each test as
    // with the `afterEach` function we are calling `signOut`
    // which deregisters the user and also resets the keyManager
    // and in turn deletes all keys in sudoKeyManager
    await sudoProfilesClient.pushSymmetricKey(
      '1234',
      '14A9B3C3540142A11E70ACBB1BD8969F',
    )
    beforeEachComplete = true
  } catch (error) {
    console.log(error)
  }
}, 30000)

afterEach(async (): Promise<void> => {
  beforeEachComplete = false
  await deregister(sudoUser)
}, 25000)

// Failures in beforeAll do not stop tests executing
function expectSetupComplete(): void {
  expect({ beforeAllComplete, beforeEachComplete }).toEqual({
    beforeAllComplete: true,
    beforeEachComplete: true,
  })
}

describe('sudoProfilesClientIntegrationTests', () => {
  describe('createSudo()', () => {
    it('should subscribe to createSudo event', async () => {
      expectSetupComplete()
      // Setup subscriber
      const subscriber = new MySubscriber()
      await sudoProfilesClient.subscribe('1', ChangeType.Create, subscriber)

      await delay(5000)

      expect(subscriber.connectionState).toBe(ConnectionState.Connected)

      //Create new Sudo
      const id = v4()
      const newSudo = new Sudo()
      newSudo.title = `dummy_title_${id}`
      newSudo.firstName = `dummy_first_name_${id}`
      newSudo.lastName = `dummy_last_name_${id}`
      newSudo.label = `dummy_label_${id}`
      newSudo.notes = `dummy_notes_${id}`

      const createdSudo = await sudoProfilesClient.createSudo(newSudo)
      expect(createdSudo).toBeTruthy()

      await delay(5000)

      expect(createdSudo.title).toBe(`dummy_title_${id}`)
      expect(createdSudo.firstName).toBe(`dummy_first_name_${id}`)
      expect(createdSudo.lastName).toBe(`dummy_last_name_${id}`)
      expect(createdSudo.label).toBe(`dummy_label_${id}`)
      expect(createdSudo.notes).toBe(`dummy_notes_${id}`)

      expect(subscriber.changeType).toBe(ChangeType.Create)
      expect(subscriber.sudo?.id).toBeTruthy()

      sudoProfilesClient.unsubscribeAll()

      const sudos = await sudoProfilesClient.listSudos(FetchOption.RemoteOnly)
      expect(sudos).toBeTruthy()
      expect(sudos.length).toBe(1)

      expect(sudos[0].title).toBe(`dummy_title_${id}`)
      expect(sudos[0].firstName).toBe(`dummy_first_name_${id}`)
      expect(sudos[0].lastName).toBe(`dummy_last_name_${id}`)
      expect(sudos[0].label).toBe(`dummy_label_${id}`)
      expect(sudos[0].notes).toBe(`dummy_notes_${id}`)

      const cachedSudos = await sudoProfilesClient.listSudos(
        FetchOption.CacheOnly,
      )
      expect(cachedSudos).toBeTruthy()
      expect(cachedSudos.length).toBe(1)

      expect(cachedSudos[0].title).toBe(`dummy_title_${id}`)
      expect(cachedSudos[0].firstName).toBe(`dummy_first_name_${id}`)
      expect(cachedSudos[0].lastName).toBe(`dummy_last_name_${id}`)
      expect(cachedSudos[0].label).toBe(`dummy_label_${id}`)
      expect(cachedSudos[0].notes).toBe(`dummy_notes_${id}`)

      await delay(5000)
    }, 120000)
  })

  describe('updateSudo()', () => {
    it('should subscribe to updateSudo event', async () => {
      expectSetupComplete()
      //Create new Sudo
      const id = v4()
      const newSudo = new Sudo()
      newSudo.title = `dummy_title_${id}`
      newSudo.firstName = `dummy_first_name_${id}`
      newSudo.lastName = `dummy_last_name_${id}`
      newSudo.label = `dummy_label_${id}`
      newSudo.notes = `dummy_notes_${id}`

      // Setup subscriber
      const subscriber = new MySubscriber()
      await sudoProfilesClient.subscribe('1', ChangeType.Update, subscriber)

      await delay(5000)

      expect(subscriber.connectionState).toBe(ConnectionState.Connected)

      const createdSudo = await sudoProfilesClient.createSudo(newSudo)

      await delay(5000)

      expect(createdSudo.title).toBe(`dummy_title_${id}`)
      expect(createdSudo.firstName).toBe(`dummy_first_name_${id}`)
      expect(createdSudo.lastName).toBe(`dummy_last_name_${id}`)
      expect(createdSudo.label).toBe(`dummy_label_${id}`)
      expect(createdSudo.notes).toBe(`dummy_notes_${id}`)

      createdSudo.title = `updated_dummy_title_${id}`
      createdSudo.firstName = `updated_dummy_first_name_${id}`
      createdSudo.lastName = `updated_dummy_last_name_${id}`
      createdSudo.label = `updated_dummy_label_${id}`
      createdSudo.notes = `updated_dummy_notes_${id}`

      const updatedSudo = await sudoProfilesClient.updateSudo(createdSudo)

      expect(updatedSudo.title).toBe(`updated_dummy_title_${id}`)
      expect(updatedSudo.firstName).toBe(`updated_dummy_first_name_${id}`)
      expect(updatedSudo.lastName).toBe(`updated_dummy_last_name_${id}`)
      expect(updatedSudo.label).toBe(`updated_dummy_label_${id}`)
      expect(updatedSudo.notes).toBe(`updated_dummy_notes_${id}`)

      await delay(5000)

      expect(subscriber.changeType).toBe(ChangeType.Update)
      expect(subscriber.sudo?.id).toBeTruthy()
      expect(subscriber.sudo?.title).toBe(`updated_dummy_title_${id}`)
      expect(subscriber.sudo?.firstName).toBe(`updated_dummy_first_name_${id}`)
      expect(subscriber.sudo?.lastName).toBe(`updated_dummy_last_name_${id}`)
      expect(subscriber.sudo?.label).toBe(`updated_dummy_label_${id}`)
      expect(subscriber.sudo?.notes).toBe(`updated_dummy_notes_${id}`)

      sudoProfilesClient.unsubscribeAll()

      const sudos = await sudoProfilesClient.listSudos(FetchOption.RemoteOnly)
      expect(sudos).toBeTruthy()
      expect(sudos.length).toBe(1)

      expect(sudos[0].title).toBe(`updated_dummy_title_${id}`)
      expect(sudos[0].firstName).toBe(`updated_dummy_first_name_${id}`)
      expect(sudos[0].lastName).toBe(`updated_dummy_last_name_${id}`)
      expect(sudos[0].label).toBe(`updated_dummy_label_${id}`)
      expect(sudos[0].notes).toBe(`updated_dummy_notes_${id}`)

      const cachedSudos = await sudoProfilesClient.listSudos(
        FetchOption.CacheOnly,
      )
      expect(cachedSudos).toBeTruthy()
      expect(cachedSudos.length).toBe(1)

      expect(cachedSudos[0].title).toBe(`updated_dummy_title_${id}`)
      expect(cachedSudos[0].firstName).toBe(`updated_dummy_first_name_${id}`)
      expect(cachedSudos[0].lastName).toBe(`updated_dummy_last_name_${id}`)
      expect(cachedSudos[0].label).toBe(`updated_dummy_label_${id}`)
      expect(cachedSudos[0].notes).toBe(`updated_dummy_notes_${id}`)

      await delay(5000)
    }, 120000)

    it('should throw VersionMismatchError when updating a sudo with the wrong version', async () => {
      expectSetupComplete()
      //Create new Sudo
      const id = v4()
      const newSudo = new Sudo()
      newSudo.title = `dummy_title_${id}`
      newSudo.firstName = `dummy_first_name_${id}`
      newSudo.lastName = `dummy_last_name_${id}`
      newSudo.label = `dummy_label_${id}`
      newSudo.notes = `dummy_notes_${id}`

      const createdSudo = await sudoProfilesClient.createSudo(newSudo)

      expect(createdSudo.title).toBe(`dummy_title_${id}`)
      expect(createdSudo.firstName).toBe(`dummy_first_name_${id}`)
      expect(createdSudo.lastName).toBe(`dummy_last_name_${id}`)
      expect(createdSudo.label).toBe(`dummy_label_${id}`)
      expect(createdSudo.notes).toBe(`dummy_notes_${id}`)
      expect(createdSudo.version).toBe(2)

      createdSudo.version = 3

      await expect(sudoProfilesClient.updateSudo(createdSudo)).rejects.toThrow(
        VersionMismatchError,
      )
    }, 30000)
  })

  describe('deleteSudo()', () => {
    it('should delete sudo, blob cache and s3 image', async () => {
      expectSetupComplete()
      //Create new Sudo
      const id = v4()
      const newSudo = new Sudo()
      newSudo.title = `dummy_title_${id}`
      newSudo.firstName = `dummy_first_name_${id}`
      newSudo.lastName = `dummy_last_name_${id}`
      newSudo.label = `dummy_label_${id}`
      newSudo.notes = `dummy_notes_${id}`
      const fileData = FS.readFileSync(
        path.resolve(__dirname, '../integration/jordan.png'),
      )
      newSudo.setAvatar(fileData.buffer)
      when(blobCacheMock.setItem(anything(), fileData)).thenResolve()
      const createdSudo = await sudoProfilesClient.createSudo(newSudo)
      expect(createdSudo.id).toBeTruthy()
      expect(createdSudo.title).toBe(`dummy_title_${id}`)
      expect(createdSudo.firstName).toBe(`dummy_first_name_${id}`)
      expect(createdSudo.lastName).toBe(`dummy_last_name_${id}`)
      expect(createdSudo.label).toBe(`dummy_label_${id}`)
      expect(createdSudo.notes).toBe(`dummy_notes_${id}`)
      expect(createdSudo.version).toBe(2)
      // list sudos and force download of avatar image
      const downloadedSudos = await sudoProfilesClient.listSudos(
        FetchOption.RemoteOnly,
      )
      expect(downloadedSudos).toBeTruthy()
      expect(downloadedSudos.length).toBe(1)
      expect(downloadedSudos[0].title).toBe(`dummy_title_${id}`)
      expect(downloadedSudos[0].firstName).toBe(`dummy_first_name_${id}`)
      expect(downloadedSudos[0].lastName).toBe(`dummy_last_name_${id}`)
      expect(downloadedSudos[0].label).toBe(`dummy_label_${id}`)
      expect(downloadedSudos[0].notes).toBe(`dummy_notes_${id}`)
      expect(downloadedSudos[0].getAvatarFile()).toBeTruthy()
      // Make sure cache has been populated
      const cachedSudos = await sudoProfilesClient.listSudos(
        FetchOption.CacheOnly,
      )
      expect(cachedSudos).toBeTruthy()
      expect(cachedSudos.length).toBe(1)
      expect(cachedSudos[0].title).toBe(`dummy_title_${id}`)
      expect(cachedSudos[0].firstName).toBe(`dummy_first_name_${id}`)
      expect(cachedSudos[0].lastName).toBe(`dummy_last_name_${id}`)
      expect(cachedSudos[0].label).toBe(`dummy_label_${id}`)
      expect(cachedSudos[0].notes).toBe(`dummy_notes_${id}`)
      expect(cachedSudos[0].getAvatarFile()).toBeTruthy()
      // Delete Sudo
      await sudoProfilesClient.deleteSudo(createdSudo)
      // Make sure sudo has been deleted
      const listDeletedSudos = await sudoProfilesClient.listSudos(
        FetchOption.RemoteOnly,
      )
      expect(listDeletedSudos).toEqual([])
    }, 120000)
  })

  describe('key namespace', () => {
    const symmetricKeyId = 'namespace-test-key'
    const symmetricKey = '0F1E2D3C4B5A69788796A5B4C3D2E1F0'

    it('should create and read back a sudo with a caller-supplied key manager', async () => {
      expectSetupComplete()
      const store = new SharedMemoryStore()

      const writer = new DefaultSudoProfilesClient({
        sudoUserClient: sudoUser,
        blobCache: blobCacheMock,
        keyManager: newKeyManager('ss', store),
      })
      await writer.pushSymmetricKey(symmetricKeyId, symmetricKey)

      const id = v4()
      const created = await writer.createSudo(newDummySudo(id))
      expect(created.id).toBeTruthy()

      // A new client instance over the same store and namespace, as an app
      // would have after a restart, can decrypt what the first one wrote.
      const reader = new DefaultSudoProfilesClient({
        sudoUserClient: sudoUser,
        blobCache: blobCacheMock,
        keyManager: newKeyManager('ss', store),
      })
      const sudos = await reader.listSudos(FetchOption.RemoteOnly)
      expect(sudos.length).toBe(1)
      expect(sudos[0].id).toBe(created.id)
      expect(sudos[0].title).toBe(`dummy_title_${id}`)
      expect(sudos[0].firstName).toBe(`dummy_first_name_${id}`)
      expect(sudos[0].lastName).toBe(`dummy_last_name_${id}`)
      expect(sudos[0].label).toBe(`dummy_label_${id}`)
      expect(sudos[0].notes).toBe(`dummy_notes_${id}`)

      // Keys are stored under the 'ss' namespace, as on iOS and Android.
      const storedNames = [...store.data.keys()]
      expect(storedNames.length).toBeGreaterThan(0)
      storedNames.forEach((name) => expect(name.startsWith('ss.')).toBe(true))
    }, 120000)

    it('should not decrypt sudos using keys from a different namespace', async () => {
      expectSetupComplete()
      const store = new SharedMemoryStore()

      const ssClient = new DefaultSudoProfilesClient({
        sudoUserClient: sudoUser,
        blobCache: blobCacheMock,
        keyManager: newKeyManager('ss', store),
      })
      await ssClient.pushSymmetricKey(symmetricKeyId, symmetricKey)

      const id = v4()
      const created = await ssClient.createSudo(newDummySudo(id))
      expect(created.id).toBeTruthy()

      // Same user and same store, but the old web default namespace.
      const legacyClient = new DefaultSudoProfilesClient({
        sudoUserClient: sudoUser,
        blobCache: blobCacheMock,
        keyManager: newKeyManager('SudoProfilesClient', store),
      })

      // It has no current symmetric key, so it cannot create a sudo...
      await expect(legacyClient.createSudo(newDummySudo(v4()))).rejects.toThrow(
        IllegalStateError,
      )
      // ...and cannot decrypt the sudo created under 'ss'.
      await expect(
        legacyClient.listSudos(FetchOption.RemoteOnly),
      ).rejects.toThrow()

      // A client in the same namespace still can.
      const sameNamespaceClient = new DefaultSudoProfilesClient({
        sudoUserClient: sudoUser,
        blobCache: blobCacheMock,
        keyManager: newKeyManager('ss', store),
      })
      const sudos = await sameNamespaceClient.listSudos(FetchOption.RemoteOnly)
      expect(sudos.length).toBe(1)
      expect(sudos[0].title).toBe(`dummy_title_${id}`)
    }, 120000)
  })

  describe('cache tests', () => {
    it('should update list cache after create, delete and update', async () => {
      expectSetupComplete()
      // Initialize the query cache. We can only do that by performing
      // a remote query.
      await sudoProfilesClient.listSudos(FetchOption.RemoteOnly)

      let cachedSudos = await sudoProfilesClient.listSudos(
        FetchOption.CacheOnly,
      )
      expect(cachedSudos.length).toBe(0)

      const id = v4()
      const newSudo = new Sudo()
      newSudo.title = `dummy_title_${id}`
      newSudo.firstName = `dummy_first_name_${id}`
      newSudo.lastName = `dummy_last_name_${id}`
      newSudo.label = `dummy_label_${id}`
      newSudo.notes = `dummy_notes_${id}`

      const createdSudo = await sudoProfilesClient.createSudo(newSudo)

      expect(createdSudo.id).toBeTruthy()
      expect(createdSudo.title).toBe(`dummy_title_${id}`)
      expect(createdSudo.firstName).toBe(`dummy_first_name_${id}`)
      expect(createdSudo.lastName).toBe(`dummy_last_name_${id}`)
      expect(createdSudo.label).toBe(`dummy_label_${id}`)
      expect(createdSudo.notes).toBe(`dummy_notes_${id}`)
      expect(createdSudo.version).toBe(2)

      // Make sure cache has been populated
      cachedSudos = await sudoProfilesClient.listSudos(FetchOption.CacheOnly)
      expect(cachedSudos.length).toBe(1)
      expect(cachedSudos[0].title).toBe(`dummy_title_${id}`)
      expect(cachedSudos[0].firstName).toBe(`dummy_first_name_${id}`)
      expect(cachedSudos[0].lastName).toBe(`dummy_last_name_${id}`)
      expect(cachedSudos[0].label).toBe(`dummy_label_${id}`)
      expect(cachedSudos[0].notes).toBe(`dummy_notes_${id}`)

      // Update Sudo
      createdSudo.title = `updated_dummy_title_${id}`
      createdSudo.firstName = `updated_dummy_first_name_${id}`
      createdSudo.lastName = `updated_dummy_last_name_${id}`
      createdSudo.label = `updated_dummy_label_${id}`
      createdSudo.notes = `updated_dummy_notes_${id}`
      const updatedSudo = await sudoProfilesClient.updateSudo(createdSudo)

      expect(updatedSudo.title).toBe(`updated_dummy_title_${id}`)
      expect(updatedSudo.firstName).toBe(`updated_dummy_first_name_${id}`)
      expect(updatedSudo.lastName).toBe(`updated_dummy_last_name_${id}`)
      expect(updatedSudo.label).toBe(`updated_dummy_label_${id}`)
      expect(updatedSudo.notes).toBe(`updated_dummy_notes_${id}`)

      // Make sure cache has been updated
      cachedSudos = await sudoProfilesClient.listSudos(FetchOption.CacheOnly)
      expect(cachedSudos.length).toBe(1)
      expect(cachedSudos[0].title).toBe(`updated_dummy_title_${id}`)
      expect(cachedSudos[0].firstName).toBe(`updated_dummy_first_name_${id}`)
      expect(cachedSudos[0].lastName).toBe(`updated_dummy_last_name_${id}`)
      expect(cachedSudos[0].label).toBe(`updated_dummy_label_${id}`)
      expect(cachedSudos[0].notes).toBe(`updated_dummy_notes_${id}`)

      // Delete Sudo
      await sudoProfilesClient.deleteSudo(createdSudo)

      // Make sure sudo has been removed from cache.
      const listDeletedSudos = await sudoProfilesClient.listSudos(
        FetchOption.CacheOnly,
      )
      expect(listDeletedSudos).toEqual([])
    }, 120000)
  })

  describe.skip('error generation tests', () => {
    it('should handle 401 when token expires', async () => {
      expectSetupComplete()

      // Create a sudo first
      const id = v4()
      const newSudo = new Sudo()
      newSudo.title = `dummy_title_${id}`

      const createdSudo = await sudoProfilesClient.createSudo(newSudo)

      // Now try to update - should get 401
      createdSudo.title = 'updated_title'

      await expect(sudoProfilesClient.updateSudo(createdSudo)).rejects.toThrow() // Should throw NotAuthorizedError
    }, 30000)
  })
})
