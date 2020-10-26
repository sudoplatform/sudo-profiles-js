import { DefaultConfigurationManager } from '@sudoplatform/sudo-common'
import { DefaultSudoUserClient } from '@sudoplatform/sudo-user'
import { DefaultKeyManager } from '../../src/core/key-manager'
import { KeyStore } from '../../src/core/key-store'
import {
  QueryCache, DefaultQueryCache,
} from '../../src/core/query-cache'
import {
  FatalError,
  IllegalArgumentException,
  GRAPHQL_ERROR_POLICY_ERROR,
  GRAPHQL_ERROR_CONDITIONAL_CHECK_FAILED,
  GRAPHQL_ERROR_SERVER_ERROR,
  PolicyFailedException,
  InternalServerException,
  ConditionalCheckFailedException,
} from '../../src/global/error'
import { Claim, StringClaimValue, Sudo } from '../../src/sudo/sudo'
import { ClaimVisibility, DefaultSudoProfilesClient } from '../../src/sudo/sudo-profiles-client'
import { mock, instance, when, reset, anything, verify, deepEqual, } from 'ts-mockito'
import {
  CreateSudoDocument,
  GetOwnershipProofDocument,
  Sudo as GQLSudo, UpdateSudoDocument,
} from '../../src/gen/graphql-types'
import { AWSAppsyncGraphQLError } from 'aws-appsync/lib/types'
import { GraphQLError } from 'graphql'
import { ApolloError } from 'apollo-client'
import { AesSecurityProvider } from '../../src/security/aesSecurityProvider'
import { Base64 } from '../../src/utils/base64'

const globalAny: any = global
globalAny.WebSocket = require('ws')
require('isomorphic-fetch')
global.crypto = require('isomorphic-webcrypto')

const apiClient = {
  mutate: jest.fn(),
  query: jest.fn(),
}

const createBackendError: (path: string[], errorType: string, rest?: any) => AWSAppsyncGraphQLError = (path = [], errorType, rest = {}) => {
  const error = {
      path,
      data: null,
      errorType,
      errorInfo: null,
      locations: [{ line: 2, column: 3 }],
      message: "Some error message",
      ...rest,
  } as AWSAppsyncGraphQLError;

  return error;
}

const createGraphQLError: (error: GraphQLError) => ApolloError = backendError => new ApolloError({
  graphQLErrors: [{ ...backendError }],
  networkError: null,
  errorMessage: `GraphQL error: ${backendError.message}`
})

const queryCache: QueryCache = mock(DefaultQueryCache) 

const config = {
  federatedSignIn: {
    appClientId: '120q904mra9d5l4psmvdbrgm49',
    signInRedirectUri: 'http://localhost:3000/callback',
    signOutRedirectUri: 'http://localhost:3000/',
    webDomain: 'id-dev-fsso-sudoplatform.auth.us-east-1.amazoncognito.com',
    identityProvider: 'Auth0',
  },
  apiService: {
    apiUrl:
      'https://xy7zw5ys7rahrponv7h26vjn6y.appsync-api.us-east-1.amazonaws.com/graphql',
    region: 'us-east-1',
  },
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
  secureVaultService: {
    region: 'us-east-1',
    poolId: 'us-east-1_6NalHLdlq',
    clientId: 'pcg1ma18cluamqrif79viaj04',
    apiUrl:
      'https://u2ysyzwojzaahbsq5toulhdt4e.appsync-api.us-east-1.amazonaws.com/graphql',
    pbkdfRounds: 100000,
  },
}

DefaultConfigurationManager.getInstance().setConfig(JSON.stringify(config))

const sudoUserClient = new DefaultSudoUserClient()
const profilesKeyManager = new DefaultKeyManager(new KeyStore())
const textEncoder = new TextEncoder()
const symmetricKeyId = '1234'
const symmetricKey = '14A9B3C3540142A11E70ACBB1BD8969F'
profilesKeyManager.setSymmetricKeyId(symmetricKeyId)
profilesKeyManager.insertKey(symmetricKeyId, textEncoder.encode(symmetricKey))
const aesSecurityProviderMock: AesSecurityProvider = mock()


const sudoProfilesClient = new DefaultSudoProfilesClient(
  sudoUserClient,
  profilesKeyManager,
  apiClient as any,
  config as any,
  undefined,
  instance(queryCache),
  instance(aesSecurityProviderMock),
)

afterEach((): void => {
  reset(queryCache)
})

describe('SudoProfilesClient', () => {
  describe('createSudo()', () => {

    it('should execute mutation', async () => {

      apiClient.mutate.mockResolvedValue({
        data: {
          createSudo: {
            id: 'SUDO_ID',
          },
          updateSudo: {
            id: 'SUDO_ID',
          },
        },
      })

      const newSudo = new Sudo()

      const result = await sudoProfilesClient.createSudo(newSudo)

      expect(apiClient.mutate).toHaveBeenCalledWith({
        mutation: CreateSudoDocument,
        variables: {
          input: {
            claims: [],
            objects: [],
          }
        }
      })
      expect(result).toBeDefined()
      expect(result.id).toBe('SUDO_ID')
    })
 
    it('should throw IllegalArgumentException when symmetric key id not set', async () => {
      const profilesKeyManagerUnit = new DefaultKeyManager(new KeyStore())
      const sudoProfilesClientUnit = new DefaultSudoProfilesClient(
        sudoUserClient,
        profilesKeyManagerUnit,
        apiClient as any,
        config as any,
      )

      expect(async () => { await sudoProfilesClientUnit.createSudo(new Sudo()) }).rejects.toThrow(IllegalArgumentException)
    })

    it('should throw PolicyFailedException when mutation fails', async () => {
      const backendError = createBackendError(['createSudo'], GRAPHQL_ERROR_POLICY_ERROR, { message: 'GraphQL error: createSudo' })
      
      apiClient.mutate.mockImplementation(() => {
        throw createGraphQLError(backendError)
      })

      try {
        await sudoProfilesClient.createSudo(new Sudo('SUDO_ID'))
        fail('Expected error not thrown.')
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyFailedException)
      }

    })

    it('should throw FatalError when mutation succeeds but graph response contains no data', async () => {
      apiClient.mutate.mockResolvedValue({
        data: {}
      })

      expect(async () => { await sudoProfilesClient.createSudo(new Sudo()) }).rejects.toThrow(FatalError)
    })
  })

  describe('updateSudo()', () => {
    it('should throw IllegalArgumentException when sudo id not set', async () => {
      expect(async () => { await sudoProfilesClient.updateSudo(new Sudo()) }).rejects.toThrow(IllegalArgumentException)
    })

    it('should execute mutation with string claims', async () => {
      const epoch = 1602657822
      const encrypted = Buffer.from('dummy_blob', 'utf-8')
      const iv = Buffer.from('dummy_iv', 'utf8')
      const encryptedData = Buffer.concat([encrypted, iv])
      const dataToEncrypt: ArrayBuffer = new TextEncoder().encode('Homer')

      apiClient.mutate.mockResolvedValue({
        data: {
          updateSudo: {
            id: 'SUDO_ID',
            version: 2,
            createdAtEpochMs: epoch,
            updatedAtEpochMs: epoch,
          },
        },
      })

      const newSudo = new Sudo('SUDO_ID', 1)
      newSudo.claims = new Map([
        ['firstName', new Claim('fistName', ClaimVisibility.Private, new StringClaimValue('Homer'))],
      ])

      when(queryCache.add(anything())).thenResolve()
      when(aesSecurityProviderMock.encrypt(symmetricKeyId, deepEqual(dataToEncrypt))).thenResolve(
        encryptedData
      )

      const result = await sudoProfilesClient.updateSudo(newSudo)

      expect(apiClient.mutate).toHaveBeenCalledWith({
        mutation: UpdateSudoDocument,
        variables: {
          input: {
            id: 'SUDO_ID',
            expectedVersion: 1,
            claims: [{
              name: 'firstName',
              version: 1,
              algorithm: 'AES/CBC/PKCS7Padding',
              keyId: symmetricKeyId,
              base64Data: Base64.encode(encryptedData)
            }],
            objects: [],
          }
        }
      })

      verify(queryCache.add(anything())).once()
      expect(result).toBeDefined()
      expect(result.id).toBe('SUDO_ID')
      expect(result.version).toBe(2)
      expect(result.createdAt).toStrictEqual(new Date(epoch))
      expect(result.updatedAt).toStrictEqual(new Date(epoch))
    })

    it('should throw ConditionalCheckFailedException when mutation fails', async () => {
      const backendError = createBackendError(['updateSudo'], GRAPHQL_ERROR_CONDITIONAL_CHECK_FAILED, { message: 'GraphQL error: updateSudo' })
      
      apiClient.mutate.mockImplementation(() => {
        throw createGraphQLError(backendError)
      })

      try {
        await sudoProfilesClient.updateSudo(new Sudo('SUDO_ID'))
        fail('Expected error not thrown.')
      } catch (error) {
        expect(error).toBeInstanceOf(ConditionalCheckFailedException)
      }
    })

    it('should throw FatalError when mutation succeeds but graph response contains no data', async () => {
      apiClient.mutate.mockResolvedValue({
        data: {}
      })

      expect(async () => { await sudoProfilesClient.updateSudo(new Sudo('SUDO_ID')) }).rejects.toThrow(FatalError)
    })

  })

  describe('getOwnershipProof()', () => {
    it('should execute mutation', async () => {
      apiClient.mutate.mockImplementation(async (opts) => {
        return {
          data: {
            getOwnershipProof: {
              jwt:
                opts.variables.input.sudoId +
                '//' +
                opts.variables.input.audience,
            },
          },
        }
      })

      const result = await sudoProfilesClient.getOwnershipProof(
        'SUDO_ID',
        'AUD',
      )

      expect(apiClient.mutate).toHaveBeenCalledWith({
        mutation: GetOwnershipProofDocument,
        variables: {
          input: {
            sudoId: 'SUDO_ID',
            audience: 'AUD',
          },
        },
      })
      expect(result).toBe('SUDO_ID//AUD')
    })
  })

  describe('listSudos()', () => {
    it('should execute query', async () => {

      const mockSudoList: GQLSudo[] = [
        {
          __typename: 'Sudo',
          id: 'SUDO_ID',
          claims: [{
            __typename: 'SecureClaim',
            name: 'firstName',
            version: 1,
            algorithm: 'AES/CBC/PKCS7Padding',
            keyId: '1234',
            base64Data: '0D+a9Q6pcJpVItUqRafDfmlYMKGUgK6T36pMG1KUW/M=',
          },],
          objects: [],
          metadata: [],
          createdAtEpochMs: 1602657822,
          updatedAtEpochMs: 1602657822,
          version: 1,
          owner: '123456789',
        },
      ]

      apiClient.query.mockImplementation(async () => {
        return {
          data: {
            listSudos: {
              items: mockSudoList,
            },
          },
        }
      })

      when(aesSecurityProviderMock.decrypt(symmetricKeyId, deepEqual(Base64.decode('0D+a9Q6pcJpVItUqRafDfmlYMKGUgK6T36pMG1KUW/M=')))).thenResolve(
        new TextEncoder().encode('Homer')
      )

      const sudos = await sudoProfilesClient.listSudos()

      expect(sudos).toHaveLength(1)
      const sudo = sudos[0]
      expect(sudo.version).toBe(1)
      expect(sudo.createdAt).toStrictEqual(new Date(1602657822))
      expect(sudo.updatedAt).toStrictEqual(new Date(1602657822))

      const mappedClaim = sudo.claims
      expect(mappedClaim.size).toBe(1)
      expect(mappedClaim.get('firstName')).toBeTruthy()
      const firstNameClaim = mappedClaim.get('firstName')
      expect(firstNameClaim.name).toBe('firstName')
      expect(firstNameClaim.visibility).toBe(ClaimVisibility.Private)
      expect(firstNameClaim.value).toBeInstanceOf(StringClaimValue)
      expect(firstNameClaim.value.value).toBe('Homer')
    })
  })

  it('should throw InternalServerException when query fails', async () => {
    const backendError = createBackendError(['listSudo'], GRAPHQL_ERROR_SERVER_ERROR, { message: 'GraphQL error: listSudo' })

    apiClient.query.mockImplementation(() => {
      throw createGraphQLError(backendError)
    })

    try {
      await sudoProfilesClient.listSudos()
      fail('Expected error not thrown.')
    } catch (error) {
      expect(error).toBeInstanceOf(InternalServerException)
    }
  })

  it('should throw FatalError when mutation succeeds but graph response contains no data', async () => {
    apiClient.query.mockResolvedValue({
      data: {}
    })

    expect(async () => { await sudoProfilesClient.listSudos() }).rejects.toThrow(FatalError)
  })
})
