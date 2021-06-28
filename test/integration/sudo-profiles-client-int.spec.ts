import {
  DefaultConfigurationManager,
  DefaultLogger,
  InsufficientEntitlementsError,
  VersionMismatchError,
} from '@sudoplatform/sudo-common'
import { DefaultSudoUserClient } from '@sudoplatform/sudo-user'
import { CognitoIdentityCredentials } from 'aws-sdk'
import FS from 'fs'
import { LocalStorage } from 'node-localstorage'
import * as path from 'path'
import { anything, mock, when } from 'ts-mockito'
import * as uuid from 'uuid'
import config from '../../config/sudoplatformconfig.json'
import {
  IdentityServiceConfig,
  IdentityServiceConfigCodec,
} from '../../src/core/identity-service-config'
import { DefaultS3Client } from '../../src/core/s3Client'
import { SudoServiceConfigCodec } from '../../src/core/sudo-service-config'
import { S3DownloadError } from '../../src/global/error'
import { FetchOption, Sudo } from '../../src/sudo/sudo'
import { DefaultSudoProfilesClient } from '../../src/sudo/sudo-profiles-client'
import {
  ChangeType,
  ConnectionState,
  SudoSubscriber,
} from '../../src/sudo/sudo-subscriber'
import { delay, signIn, signOut } from './test-helper'

//const globalAny: any = global
global.WebSocket = require('ws')
global.crypto = require('isomorphic-webcrypto')
require('isomorphic-fetch')
global.localStorage = new LocalStorage('./scratch')
global.btoa = (b) => Buffer.from(b).toString('base64')
global.atob = (a) => Buffer.from(a, 'base64').toString()

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

const logger = new DefaultLogger('Sudo Profiles Client Tests')
DefaultConfigurationManager.getInstance().setConfig(JSON.stringify(config))

const userClient = new DefaultSudoUserClient()

const identityServiceConfig =
  DefaultConfigurationManager.getInstance().bindConfigSet<IdentityServiceConfig>(
    IdentityServiceConfigCodec,
    'identityService',
  )

const sudoServiceConfig =
  DefaultConfigurationManager.getInstance().bindConfigSet<IdentityServiceConfig>(
    SudoServiceConfigCodec,
    'sudoService',
  )

const s3Client = new DefaultS3Client(
  userClient,
  identityServiceConfig,
  sudoServiceConfig,
  logger,
)

const blobCacheMock: LocalForage = mock()

const sudoProfilesClient = new DefaultSudoProfilesClient({
  sudoUserClient: userClient,
  disableOffline: true,
  blobCache: blobCacheMock,
})

beforeEach(async (): Promise<void> => {
  try {
    await signIn(userClient)
    // Setup symmetric key before each test as
    // with the `afterEach` function we are calling `signOut`
    // which deregisters the user and also resets the keyManager
    // and in turn deletes all keys in sudoKeyManager
    await sudoProfilesClient.pushSymmetricKey(
      '1234',
      '14A9B3C3540142A11E70ACBB1BD8969F',
    )
  } catch (error) {
    fail(error)
  }
}, 30000)

afterEach(async (): Promise<void> => {
  await signOut(userClient)
}, 25000)

describe('sudoProfilesClientIntegrationTests', () => {
  describe('redeem()', () => {
    it('should redeem entitlement', async () => {
      // Redeem Entitlement
      const entitlements = await sudoProfilesClient.redeem(
        'sudoplatform.sudo.max=1',
        'entitlements',
      )
      expect(entitlements).toBeTruthy()
      expect(entitlements.length).toBeGreaterThanOrEqual(1)
      expect(entitlements[0].name).toBe('sudoplatform.sudo.max')
      expect(entitlements[0].value).toBe(1)

      // Create new Sudo
      const newSudo = new Sudo()
      newSudo.title = 'dummy_title'
      newSudo.firstName = 'dummy_first_name'
      newSudo.lastName = 'dummy_last_name'
      newSudo.label = 'dummy_label'
      newSudo.notes = 'dummy_notes'

      const createdSudo = await sudoProfilesClient.createSudo(newSudo)

      expect(createdSudo.title).toBe('dummy_title')
      expect(createdSudo.firstName).toBe('dummy_first_name')
      expect(createdSudo.lastName).toBe('dummy_last_name')
      expect(createdSudo.label).toBe('dummy_label')
      expect(createdSudo.notes).toBe('dummy_notes')

      const sudos = await sudoProfilesClient.listSudos()
      expect(sudos.length).toBe(1)

      const sudo = sudos[0]
      expect(sudo.title).toBe('dummy_title')
      expect(sudo.firstName).toBe('dummy_first_name')
      expect(sudo.lastName).toBe('dummy_last_name')
      expect(sudo.label).toBe('dummy_label')
      expect(sudo.notes).toBe('dummy_notes')

      //Try and create another sudo
      const anotherSudo = new Sudo()
      anotherSudo.title = 'dummy2_title'
      anotherSudo.firstName = 'dummy2_first_name'
      anotherSudo.lastName = 'dummy2_last_name'
      anotherSudo.label = 'dummy2_label'
      anotherSudo.notes = 'dummy2_notes'

      try {
        await sudoProfilesClient.createSudo(anotherSudo)
        fail('Creating more sudos was expected to fail.')
      } catch (error) {
        expect(error).toBeInstanceOf(InsufficientEntitlementsError)
      }
    }, 60000)
  })

  describe('createSudo()', () => {
    it.skip('should subscribe to createSudo event', async () => {
      // Redeem Entitlement
      const entitlements = await sudoProfilesClient.redeem(
        'sudoplatform.sudo.max=1',
        'entitlements',
      )
      expect(entitlements).toBeTruthy()
      expect(entitlements.length).toBeGreaterThanOrEqual(1)
      expect(entitlements[0].name).toBe('sudoplatform.sudo.max')
      expect(entitlements[0].value).toBe(1)

      // Setup subscriber
      const subscriber = new MySubscriber()
      sudoProfilesClient.subscribe('1', ChangeType.Create, subscriber)

      await delay(5000)

      expect(subscriber.connectionState).toBe(ConnectionState.Connected)

      //Create new Sudo
      const id = uuid.v4()
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

      sudoProfilesClient.unsubscribeAll()

      await delay(15000)
    }, 120000)
  })

  describe('updateSudo()', () => {
    it.skip('should subscribe to updateSudo event', async () => {
      //Create new Sudo
      const id = uuid.v4()
      const newSudo = new Sudo()
      newSudo.title = `dummy_title_${id}`
      newSudo.firstName = `dummy_first_name_${id}`
      newSudo.lastName = `dummy_last_name_${id}`
      newSudo.label = `dummy_label_${id}`
      newSudo.notes = `dummy_notes_${id}`

      // Setup subscriber
      const subscriber = new MySubscriber()
      sudoProfilesClient.subscribe('1', ChangeType.Update, subscriber)

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

      sudoProfilesClient.unsubscribeAll()
    }, 120000)

    it('should throw VersionMismatchError when updating a sudo with the wrong version', async () => {
      //Create new Sudo
      const id = uuid.v4()
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
      const id = uuid.v4()
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
      const cacheId = `sudo/${createdSudo.id}/avatar`

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

      // Make sure file has been deleted from S3
      // Need to get identity
      const authTokens = await userClient.getLatestAuthToken()
      const providerName = `cognito-idp.${identityServiceConfig.region}.amazonaws.com/${identityServiceConfig.poolId}`
      const credentialsProvider = new CognitoIdentityCredentials(
        {
          IdentityPoolId: identityServiceConfig.identityPoolId,
          Logins: {
            [providerName]: authTokens,
          },
        },
        {
          region: 'us-east-1',
        },
      )
    }, 120000)
  })
})
