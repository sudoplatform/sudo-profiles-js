import {
  DefaultConfigurationManager,
  IllegalArgumentError,
  IllegalStateError,
  NotSignedInError,
} from '@sudoplatform/sudo-common'
import { SudoUserClient } from '@sudoplatform/sudo-user'
import FS from 'fs'
import * as path from 'path'
import { instance, mock, reset, when } from 'ts-mockito'
import * as uuid from 'uuid'
import config from '../../config/sudoplatformconfig.json'
import { ApiClient } from '../../src/client/apiClient'
import { InMemoryKeyStore } from '../../src/core/key-store'
import { QueryCache } from '../../src/core/query-cache'
import { S3Client } from '../../src/core/s3Client'
import { SudoNotFoundError } from '../../src/global/error'
import { AesSecurityProvider } from '../../src/security/aesSecurityProvider'
import { Sudo } from '../../src/sudo/sudo'
import { DefaultSudoProfilesClient } from '../../src/sudo/sudo-profiles-client'
import {
  ChangeType,
  ConnectionState,
  SudoSubscriber,
} from '../../src/sudo/sudo-subscriber'

const globalAny: any = global
globalAny.WebSocket = require('ws')
require('isomorphic-fetch')
global.crypto = require('isomorphic-webcrypto')

const queryCacheMock: QueryCache = mock()
const apiClientMock: ApiClient = mock()
const sudoUserClientMock: SudoUserClient = mock()
const aesSecurityProviderMock: AesSecurityProvider = mock()
const blobCacheMock: LocalForage = mock()
const s3ClientMock: S3Client = mock()

DefaultConfigurationManager.getInstance().setConfig(JSON.stringify(config))

const sudoProfilesClient = new DefaultSudoProfilesClient({
  sudoUserClient: instance(sudoUserClientMock),
  keyStore: new InMemoryKeyStore(),
  apiClient: apiClientMock,
  s3Client: s3ClientMock,
  securityProvider: instance(aesSecurityProviderMock),
  blobCache: blobCacheMock,
})
sudoProfilesClient.pushSymmetricKey('1234', '14A9B3C3540142A11E70ACBB1BD8969F')

class MySubscriber implements SudoSubscriber {
  public connectionState: ConnectionState | undefined = undefined
  public changeType: ChangeType | undefined = undefined
  public sudo: Sudo | undefined = undefined

  sudoChanged(changeType: ChangeType, sudo: Sudo): void {
    console.log('MySubscriber sudo changed event')
    this.changeType = changeType
    this.sudo = sudo
  }

  connectionStatusChanged(state: ConnectionState): void {
    console.log('MySubscriber connection status changed event')
    this.connectionState = state
  }
}

beforeEach(
  async (): Promise<void> => {
    reset(queryCacheMock)
    reset(sudoUserClientMock)
    reset(apiClientMock)
    reset(aesSecurityProviderMock)
    reset(blobCacheMock)
    await sudoProfilesClient.reset()
  },
)

afterEach(
  async (): Promise<void> => {
    reset(queryCacheMock)
    reset(sudoUserClientMock)
    reset(apiClientMock)
    reset(aesSecurityProviderMock)
    reset(blobCacheMock)
    await sudoProfilesClient.reset()
  },
)

describe('SudoProfilesClient', () => {
  describe('createSudo()', () => {
    it('should throw IllegalStateError when symmetric key id not set', async () => {
      const sudoProfilesClientUnit = new DefaultSudoProfilesClient({
        sudoUserClient: sudoUserClientMock,
        keyStore: new InMemoryKeyStore(),
      })

      await expect(
        sudoProfilesClientUnit.createSudo(new Sudo()),
      ).rejects.toThrow(IllegalStateError)
    })
  }) // createSudo

  describe('updateSudo()', () => {
    it('should throw IllegalArgumentError when sudo id not set', async () => {
      await expect(sudoProfilesClient.updateSudo(new Sudo())).rejects.toThrow(
        IllegalArgumentError,
      )
    })

    it('should throw IllegalStateError when symmetric key id not set', async () => {
      const sudoProfilesClientUnit = new DefaultSudoProfilesClient({
        sudoUserClient: sudoUserClientMock,
        keyStore: new InMemoryKeyStore(),
      })

      await expect(
        sudoProfilesClientUnit.updateSudo(new Sudo('SUDO_ID')),
      ).rejects.toThrow(IllegalStateError)
    })
  }) // updateSudo

  describe('subscribe()', () => {
    it('should throw NotSignedInError', async () => {
      when(sudoUserClientMock.getSubject()).thenReturn(undefined)

      try {
        sudoProfilesClient.subscribe(
          'dummy_id',
          ChangeType.Create,
          new MySubscriber(),
        )
      } catch (err) {
        expect(err).toBeInstanceOf(NotSignedInError)
      }
    })
  }) // Subscribe

  describe('delete()', () => {
    it('should throw IllegalArguementError when no sudo id', async () => {
      const sudo = new Sudo()

      await expect(sudoProfilesClient.deleteSudo(sudo)).rejects.toThrow(
        IllegalArgumentError,
      )
    })

    it('should throw SudoNotFoundError when sudo not found', async () => {
      const sudo = new Sudo(uuid.v4())

      await expect(sudoProfilesClient.deleteSudo(sudo)).rejects.toThrow(
        SudoNotFoundError,
      )
    })

    it('should remove cache and delete s3 blob when deleting sudo', async () => {
      const sudo = new Sudo('SUDO_ID')

      const fileData = FS.readFileSync(
        path.resolve(__dirname, '../integration/jordan.png'),
      )
      const arrayBuffer = Uint8Array.from(fileData).buffer
      sudo.setAvatar(arrayBuffer)
      const cacheId = 'sudo/SUDO_ID/avatar'

      jest
        .spyOn(sudoProfilesClient, 'listSudos')
        .mockImplementation(async () => [sudo])
      when(blobCacheMock.getItem(cacheId)).thenResolve(arrayBuffer)
      when(s3ClientMock.delete(cacheId)).thenResolve()
      when(blobCacheMock.removeItem(cacheId)).thenResolve()

      await sudoProfilesClient.deleteSudo(sudo)
    })
  })
})
