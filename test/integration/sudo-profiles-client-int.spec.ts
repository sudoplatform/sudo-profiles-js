import { DefaultApiClientManager } from '@sudoplatform/sudo-api-client'
import {
  DefaultConfigurationManager,
  VersionMismatchError,
} from '@sudoplatform/sudo-common'
import { DefaultSudoEntitlementsClient } from '@sudoplatform/sudo-entitlements'
import { DefaultSudoUserClient } from '@sudoplatform/sudo-user'
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
import { SudoNotFoundInCacheError } from '../../src/global/error'

global.WebSocket = require('ws')
// eslint-disable-next-line @typescript-eslint/no-var-requires
global.crypto = require('crypto').webcrypto
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder as typeof global.TextDecoder
require('isomorphic-fetch')

const config = JSON.parse(
  FS.readFileSync(`${__dirname}/../../config/sudoplatformconfig.json`).toString(
    'binary',
  ),
)

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

export class MyStorage {
  private items = new Map<string, string>()

  getItem(
    key: string,
    cb: (error: Error | null, result?: string) => void,
  ): void {
    const storedValue = this.items.get(key)
    process.nextTick(() => cb(null, storedValue))
  }

  setItem(key: string, value: string, cb: (error: Error | null) => void): void {
    this.items.set(key, value)
    process.nextTick(() => cb(null))
  }

  removeItem(key: string, cb: (error: Error | null) => void): void {
    this.items.delete(key)
    process.nextTick(() => cb(null))
  }

  getAllKeys(cb: (error: Error | null, keys?: string[]) => void): void {
    const keys = [...this.items.keys()]
    process.nextTick(() => cb(null, keys))
  }
}

DefaultConfigurationManager.getInstance().setConfig(JSON.stringify(config))

const userClient = new DefaultSudoUserClient()
const storage = new MyStorage()

DefaultApiClientManager.getInstance()
  .setAuthClient(userClient)
  .getClient({ disableOffline: false, storage })

const blobCacheMock: LocalForage = mock()

const sudoProfilesClient = new DefaultSudoProfilesClient({
  sudoUserClient: userClient,
  blobCache: blobCacheMock,
})

const entitlementsClient = new DefaultSudoEntitlementsClient(userClient)

beforeEach(async (): Promise<void> => {
  try {
    await registerAndSignIn(userClient)

    await entitlementsClient.redeemEntitlements()
    // Setup symmetric key before each test as
    // with the `afterEach` function we are calling `signOut`
    // which deregisters the user and also resets the keyManager
    // and in turn deletes all keys in sudoKeyManager
    await sudoProfilesClient.pushSymmetricKey(
      '1234',
      '14A9B3C3540142A11E70ACBB1BD8969F',
    )
  } catch (error) {
    console.log(error)
  }
}, 30000)

afterEach(async (): Promise<void> => {
  await deregister(userClient)
}, 25000)

describe('sudoProfilesClientIntegrationTests', () => {
  describe('createSudo()', () => {
    it('should subscribe to createSudo event', async () => {
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
      newSudo.setAvatar(fileData)

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

  describe('cache tests', () => {
    it('should update list cache after create, delete and update', async () => {
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
})
