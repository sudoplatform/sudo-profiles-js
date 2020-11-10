import {
  DefaultConfigurationManager,
  IllegalArgumentError,
  IllegalStateError,
  NotSignedInError,
} from '@sudoplatform/sudo-common'
import { SudoUserClient } from '@sudoplatform/sudo-user'
import { instance, mock, reset, when } from 'ts-mockito'
import config from '../../config/sudoplatformconfig.json'
import { ApiClient } from '../../src/client/apiClient'
import { DefaultKeyManager } from '../../src/core/key-manager'
import { KeyStore } from '../../src/core/key-store'
import { QueryCache } from '../../src/core/query-cache'
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
const profilesKeyManager = new DefaultKeyManager(new KeyStore())
const textEncoder = new TextEncoder()
const symmetricKeyId = '1234'
const symmetricKey = '14A9B3C3540142A11E70ACBB1BD8969F'
profilesKeyManager.setSymmetricKeyId(symmetricKeyId)
profilesKeyManager.insertKey(symmetricKeyId, textEncoder.encode(symmetricKey))

DefaultConfigurationManager.getInstance().setConfig(JSON.stringify(config))

const sudoProfilesClient = new DefaultSudoProfilesClient(
  instance(sudoUserClientMock),
  profilesKeyManager,
  apiClientMock,
  config as any,
  undefined,
  queryCacheMock,
  instance(aesSecurityProviderMock),
  blobCacheMock,
)

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
      const profilesKeyManagerUnit = new DefaultKeyManager(new KeyStore())
      const blobCacheMock: LocalForage = mock()

      const sudoProfilesClientUnit = new DefaultSudoProfilesClient(
        sudoUserClientMock,
        profilesKeyManagerUnit,
        apiClientMock,
        config as any,
        undefined,
        queryCacheMock,
        aesSecurityProviderMock,
        blobCacheMock,
      )

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
      const profilesKeyManagerUnit = new DefaultKeyManager(new KeyStore())
      const blobCacheMock: LocalForage = mock()

      const sudoProfilesClientUnit = new DefaultSudoProfilesClient(
        sudoUserClientMock,
        profilesKeyManagerUnit,
        apiClientMock,
        config as any,
        undefined,
        queryCacheMock,
        aesSecurityProviderMock,
        blobCacheMock,
      )

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
})
