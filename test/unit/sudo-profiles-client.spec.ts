import {
  DefaultConfigurationManager,
  IllegalArgumentError,
  IllegalStateError,
  NotSignedInError,
  SudoKeyManager,
} from '@sudoplatform/sudo-common'
import { DefaultSudoUserClient, SudoUserClient } from '@sudoplatform/sudo-user'
import FS from 'fs'
import * as path from 'path'
import { instance, mock, reset, verify, when } from 'ts-mockito'
import { TextEncoder, TextDecoder } from 'util'
import * as uuid from 'uuid'

import { ApiClient } from '../../src/client/apiClient'
import { QueryCache } from '../../src/core/query-cache'
import { S3Client } from '../../src/core/s3Client'
import {
  InvalidConfigError,
  SudoNotFoundError,
  SudoServiceConfigNotFoundError,
} from '../../src/global/error'
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
// eslint-disable-next-line @typescript-eslint/no-var-requires
global.crypto = require('crypto').webcrypto
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder as typeof global.TextDecoder

const queryCacheMock: QueryCache = mock()
const apiClientMock: ApiClient = mock()
const sudoKeyManagerMock: SudoKeyManager = mock()
const sudoUserClientMock: SudoUserClient = mock()
const blobCacheMock: LocalForage = mock()
const s3ClientMock: S3Client = mock()
const keyManager = instance(sudoKeyManagerMock)

DefaultConfigurationManager.getInstance().setConfig(
  JSON.stringify({
    identityService: {
      region: 'us-east-1',
      poolId: 'us-east-1_ZiPDToF73',
      clientId: '120q904mra9d5l4psmvdbrgm49',
      identityPoolId: 'us-east-1:8fe6d8ed-cd77-4622-b1bb-3f0c147638ad',
      apiUrl:
        'https://mqn7cjrzcrd75jpsma3xw4744a.appsync-api.us-east-1.amazonaws.com/graphql',
      apiKey: 'da2-xejsa343urfifmzkycmz3rqdom',
      bucket: 'ids-userdata-id-dev-fsso-userdatabucket2d841c35-j9x47k5042fk',
      transientBucket:
        'ids-userdata-id-dev-fsso-transientuserdatabucket0-1enoeyoho1sjl',
      registrationMethods: ['TEST', 'FSSO'],
    },
    apiService: {
      apiUrl:
        'https://xy7zw5ys7rahrponv7h26vjn6y.appsync-api.us-east-1.amazonaws.com/graphql',
      simulatorApiUrl:
        'https://ylityqhzqvexfayi3hrwuih2gy.appsync-api.us-east-1.amazonaws.com/graphql',
      region: 'us-east-1',
    },
    federatedSignIn: {
      appClientId: '120q904mra9d5l4psmvdbrgm49',
      signInRedirectUri: 'com.anonyome.mysudo-dev://',
      signOutRedirectUri: 'com.anonyome.mysudo-dev://',
      webDomain: 'id-dev-fsso-sudoplatform.auth.us-east-1.amazoncognito.com',
    },
    adminConsoleProjectService: {
      region: 'us-east-1',
      apiUrl:
        'https://in44ukfblnb5pnq7nrsv5mfyjy.appsync-api.us-east-1.amazonaws.com/graphql',
      userPoolId: 'us-east-1_6HoXV6Uga',
      clientId: '3cj335g0l1prnl65p7p2vq27sa',
    },
    secureVaultService: {
      region: 'us-east-1',
      poolId: 'us-east-1_6NalHLdlq',
      clientId: 'pcg1ma18cluamqrif79viaj04',
      apiUrl:
        'https://u2ysyzwojzaahbsq5toulhdt4e.appsync-api.us-east-1.amazonaws.com/graphql',
      pbkdfRounds: 100000,
    },
    sudoService: {
      region: 'us-east-1',
      bucket: 'ids-userdata-id-dev-fsso-userdatabucket2d841c35-j9x47k5042fk',
    },
  }),
)

const sudoUserClient = new DefaultSudoUserClient({
  sudoKeyManager: keyManager,
})

const sudoProfilesClient = new DefaultSudoProfilesClient({
  sudoUserClient: instance(sudoUserClientMock),
  apiClient: apiClientMock,
  s3Client: s3ClientMock,
  blobCache: blobCacheMock,
})

beforeAll(async () => {
  await sudoProfilesClient.pushSymmetricKey(
    '1234',
    '14A9B3C3540142A11E70ACBB1BD8969F',
  )
})

class MySubscriber implements SudoSubscriber {
  public connectionState: ConnectionState | undefined = undefined
  public changeType: ChangeType | undefined = undefined
  public sudo: Sudo | undefined = undefined

  sudoChanged(changeType: ChangeType, sudo: Sudo): void {
    this.changeType = changeType
    this.sudo = sudo
  }

  connectionStatusChanged(state: ConnectionState): void {
    this.connectionState = state
  }
}

beforeEach(async (): Promise<void> => {
  reset(queryCacheMock)
  reset(sudoUserClientMock)
  reset(apiClientMock)
  reset(blobCacheMock)
  await sudoProfilesClient.reset()
  reset(sudoKeyManagerMock)
})

afterEach(async (): Promise<void> => {
  reset(queryCacheMock)
  reset(sudoUserClientMock)
  reset(apiClientMock)
  reset(blobCacheMock)
  await sudoProfilesClient.reset()
  reset(sudoKeyManagerMock)
})

describe('SudoProfilesClient', () => {
  describe('createSudo()', () => {
    it('should throw IllegalStateError when symmetric key id not set', async () => {
      const sudoProfilesClientUnit = new DefaultSudoProfilesClient({
        sudoUserClient: sudoUserClient,
        keyManager: keyManager,
        apiClient: apiClientMock,
      })

      when(sudoKeyManagerMock.getSymmetricKey('symmetricKeyId')).thenResolve(
        undefined,
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
      const sudoProfilesClientUnit = new DefaultSudoProfilesClient({
        sudoUserClient: sudoUserClient,
        apiClient: apiClientMock,
      })

      when(sudoKeyManagerMock.getSymmetricKey('symmetricKeyId')).thenResolve(
        undefined,
      )

      await expect(
        sudoProfilesClientUnit.updateSudo(new Sudo('SUDO_ID')),
      ).rejects.toThrow(IllegalStateError)
    })
  }) // updateSudo

  describe('subscribe()', () => {
    it('should throw NotSignedInError when no subject is returned', async () => {
      when(sudoUserClientMock.getSubject()).thenResolve(undefined)

      try {
        await sudoProfilesClient.subscribe(
          'dummy_id',
          ChangeType.Create,
          new MySubscriber(),
        )
      } catch (err) {
        expect(err).toBeInstanceOf(NotSignedInError)
      }

      verify(sudoUserClientMock.getSubject()).once()
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
        .mockImplementation(() => Promise.resolve([sudo]))
      when(blobCacheMock.getItem(cacheId)).thenResolve(arrayBuffer)
      when(s3ClientMock.delete(cacheId)).thenResolve()
      when(blobCacheMock.removeItem(cacheId)).thenResolve()

      await sudoProfilesClient.deleteSudo(sudo)
    })
  })

  describe('config tests', () => {
    it('should throw SudoSerivceConfigNotFoundError when sudoService config is missing.', () => {
      DefaultConfigurationManager.getInstance().setConfig(
        JSON.stringify({
          identityService: {
            region: 'us-east-1',
            poolId: 'us-east-1_ZiPDToF73',
            clientId: '120q904mra9d5l4psmvdbrgm49',
            identityPoolId: 'us-east-1:8fe6d8ed-cd77-4622-b1bb-3f0c147638ad',
            apiUrl:
              'https://mqn7cjrzcrd75jpsma3xw4744a.appsync-api.us-east-1.amazonaws.com/graphql',
            apiKey: 'da2-xejsa343urfifmzkycmz3rqdom',
            bucket:
              'ids-userdata-id-dev-fsso-userdatabucket2d841c35-j9x47k5042fk',
            transientBucket:
              'ids-userdata-id-dev-fsso-transientuserdatabucket0-1enoeyoho1sjl',
            registrationMethods: ['TEST', 'FSSO'],
          },
          apiService: {
            apiUrl:
              'https://xy7zw5ys7rahrponv7h26vjn6y.appsync-api.us-east-1.amazonaws.com/graphql',
            simulatorApiUrl:
              'https://ylityqhzqvexfayi3hrwuih2gy.appsync-api.us-east-1.amazonaws.com/graphql',
            region: 'us-east-1',
          },
        }),
      )

      expect(() => {
        new DefaultSudoProfilesClient({
          sudoUserClient: sudoUserClient,
          keyManager: keyManager,
        })
      }).toThrow(SudoServiceConfigNotFoundError)
    })

    it('should throw InvalidConfigError if no bucket information is found in identityService or sudoService config', () => {
      DefaultConfigurationManager.getInstance().setConfig(
        JSON.stringify({
          identityService: {
            region: 'us-east-1',
            poolId: 'us-east-1_ZiPDToF73',
            clientId: '120q904mra9d5l4psmvdbrgm49',
            identityPoolId: 'us-east-1:8fe6d8ed-cd77-4622-b1bb-3f0c147638ad',
            apiUrl:
              'https://mqn7cjrzcrd75jpsma3xw4744a.appsync-api.us-east-1.amazonaws.com/graphql',
            apiKey: 'da2-xejsa343urfifmzkycmz3rqdom',
            transientBucket:
              'ids-userdata-id-dev-fsso-transientuserdatabucket0-1enoeyoho1sjl',
            registrationMethods: ['TEST', 'FSSO'],
          },
          apiService: {
            apiUrl:
              'https://xy7zw5ys7rahrponv7h26vjn6y.appsync-api.us-east-1.amazonaws.com/graphql',
            simulatorApiUrl:
              'https://ylityqhzqvexfayi3hrwuih2gy.appsync-api.us-east-1.amazonaws.com/graphql',
            region: 'us-east-1',
          },
          sudoService: {},
        }),
      )

      expect(() => {
        new DefaultSudoProfilesClient({
          sudoUserClient: sudoUserClient,
          keyManager: keyManager,
          apiClient: apiClientMock,
        })
      }).toThrow(InvalidConfigError)
    })

    it('should succeed if sudoService config does not contain bucket information but identityService config does.', () => {
      DefaultConfigurationManager.getInstance().setConfig(
        JSON.stringify({
          identityService: {
            region: 'us-east-1',
            poolId: 'us-east-1_ZiPDToF73',
            clientId: '120q904mra9d5l4psmvdbrgm49',
            identityPoolId: 'us-east-1:8fe6d8ed-cd77-4622-b1bb-3f0c147638ad',
            apiUrl:
              'https://mqn7cjrzcrd75jpsma3xw4744a.appsync-api.us-east-1.amazonaws.com/graphql',
            apiKey: 'da2-xejsa343urfifmzkycmz3rqdom',
            bucket:
              'ids-userdata-id-dev-fsso-userdatabucket2d841c35-j9x47k5042fk',
            transientBucket:
              'ids-userdata-id-dev-fsso-transientuserdatabucket0-1enoeyoho1sjl',
            registrationMethods: ['TEST', 'FSSO'],
          },
          apiService: {
            apiUrl:
              'https://xy7zw5ys7rahrponv7h26vjn6y.appsync-api.us-east-1.amazonaws.com/graphql',
            simulatorApiUrl:
              'https://ylityqhzqvexfayi3hrwuih2gy.appsync-api.us-east-1.amazonaws.com/graphql',
            region: 'us-east-1',
          },
          sudoService: {},
        }),
      )

      expect(() => {
        new DefaultSudoProfilesClient({
          sudoUserClient: sudoUserClient,
          keyManager: keyManager,
          apiClient: apiClientMock,
        })
      }).not.toThrow(InvalidConfigError)
    })

    it('should succeed if sudoService config contains bucket information but identityService config does not.', () => {
      DefaultConfigurationManager.getInstance().setConfig(
        JSON.stringify({
          identityService: {
            poolId: 'us-east-1_ZiPDToF73',
            clientId: '120q904mra9d5l4psmvdbrgm49',
            identityPoolId: 'us-east-1:8fe6d8ed-cd77-4622-b1bb-3f0c147638ad',
            apiUrl:
              'https://mqn7cjrzcrd75jpsma3xw4744a.appsync-api.us-east-1.amazonaws.com/graphql',
            apiKey: 'da2-xejsa343urfifmzkycmz3rqdom',
            transientBucket:
              'ids-userdata-id-dev-fsso-transientuserdatabucket0-1enoeyoho1sjl',
            registrationMethods: ['TEST', 'FSSO'],
          },
          apiService: {
            apiUrl:
              'https://xy7zw5ys7rahrponv7h26vjn6y.appsync-api.us-east-1.amazonaws.com/graphql',
            simulatorApiUrl:
              'https://ylityqhzqvexfayi3hrwuih2gy.appsync-api.us-east-1.amazonaws.com/graphql',
            region: 'us-east-1',
          },
          sudoService: {
            region: 'us-east-1',
            bucket:
              'ids-userdata-id-dev-fsso-userdatabucket2d841c35-j9x47k5042fk',
          },
        }),
      )

      expect(() => {
        new DefaultSudoProfilesClient({
          sudoUserClient: sudoUserClient,
          keyManager: keyManager,
          apiClient: apiClientMock,
        })
      }).not.toThrow(InvalidConfigError)
    })
  })
})
