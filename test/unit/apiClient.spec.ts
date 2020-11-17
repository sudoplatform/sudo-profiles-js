import {
  DefaultConfigurationManager,
  FatalError,
  PolicyError,
  ServiceError,
  VersionMismatchError,
  getLogger,
} from '@sudoplatform/sudo-common'
import { DefaultSudoUserClient } from '@sudoplatform/sudo-user'
import { ApolloError } from 'apollo-client'
import { AWSAppsyncGraphQLError } from 'aws-appsync/lib/types'
import { GraphQLError } from 'graphql'
import config from '../../config/sudoplatformconfig.json'
import { ApiClient } from '../../src/client/apiClient'
import { DefaultQueryCache } from '../../src/core/query-cache'
import {
  CreateSudoDocument,
  GetOwnershipProofDocument,
  RedeemTokenDocument,
  UpdateSudoDocument,
  DeleteSudoDocument,
} from '../../src/gen/graphql-types'
import {
  GRAPHQL_ERROR_CONDITIONAL_CHECK_FAILED,
  GRAPHQL_ERROR_POLICY_ERROR,
  GRAPHQL_ERROR_SERVER_ERROR,
  GRAPHQL_ERROR_SUDO_NOT_FOUND,
  SudoNotFoundError,
} from '../../src/global/error'
import { SymmetricKeyEncryptionAlgorithm } from '../../src/security/securityProvider'
import { ErrorOption, FetchOption } from '../../src/sudo/sudo'
import { Base64 } from '../../src/utils/base64'

const globalAny: any = global
globalAny.WebSocket = require('ws')
require('isomorphic-fetch')
global.crypto = require('isomorphic-webcrypto')

DefaultConfigurationManager.getInstance().setConfig(JSON.stringify(config))
const sudoUserClient = new DefaultSudoUserClient()

const client = {
  mutate: jest.fn(),
  query: jest.fn(),
}
const logger = getLogger()

const apiClient = new ApiClient(
  sudoUserClient,
  client as any,
  new DefaultQueryCache(client as any, logger),
  logger,
)

const createBackendError: (
  path: string[],
  errorType: string,
  rest?: any,
) => AWSAppsyncGraphQLError = (path = [], errorType, rest = {}) => {
  const error = {
    path,
    data: null,
    errorType,
    errorInfo: null,
    locations: [{ line: 2, column: 3 }],
    message: 'Some error message',
    ...rest,
  } as AWSAppsyncGraphQLError

  return error
}
const createGraphQLError: (error: GraphQLError) => ApolloError = (
  backendError,
) =>
  new ApolloError({
    graphQLErrors: [{ ...backendError }],
    networkError: null,
    errorMessage: `GraphQL error: ${backendError.message}`,
  })


describe('ApiClient', () => {
  describe('createSudo()', () => {
    it('should execute mutation', async () => {
      client.mutate.mockResolvedValue({
        data: {
          createSudo: {
            id: 'SUDO_ID',
          },
          updateSudo: {
            id: 'SUDO_ID',
          },
        },
      })

      const result = await apiClient.createSudo({
        claims: [],
        objects: [],
      })

      expect(client.mutate).toHaveBeenCalledWith({
        mutation: CreateSudoDocument,
        variables: {
          input: {
            claims: [],
            objects: [],
          },
        },
        fetchPolicy: FetchOption.NoCache,
      })
      expect(result).toBeDefined()
      expect(result.id).toBe('SUDO_ID')
    })

    it('should throw FatalError when mutation succeeds but graph response contains no data', async () => {
      client.mutate.mockResolvedValue({
        data: {},
      })

      await expect(
        apiClient.createSudo({
          claims: [],
          objects: [],
        }),
      ).rejects.toThrow(FatalError)
    })

    it('should throw PolicyError when mutation fails', async () => {
      const backendError = createBackendError(
        ['createSudo'],
        GRAPHQL_ERROR_POLICY_ERROR,
        { message: 'GraphQL error: createSudo' },
      )

      client.mutate.mockImplementation(() => {
        throw createGraphQLError(backendError)
      })

      try {
        await apiClient.createSudo({
          claims: [],
          objects: [],
        })
        fail('Expected error not thrown.')
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyError)
      }
    })
  }) // createSudo

  describe('updateSudo()', () => {
    it('should execute mutation with string claims', async () => {
      const symmetricKeyId = '1234'
      const epoch = 1602657822
      const encrypted = Buffer.from('dummy_blob', 'utf-8')
      const iv = Buffer.from('dummy_iv', 'utf8')
      const encryptedData = Buffer.concat([encrypted, iv])
      const dataToEncrypt: ArrayBuffer = new TextEncoder().encode('Homer')

      client.mutate.mockResolvedValue({
        data: {
          updateSudo: {
            id: 'dummy_id',
            version: 2,
            createdAtEpochMs: epoch,
            updatedAtEpochMs: epoch,
          },
        },
      })

      await apiClient.updateSudo({
        id: 'dummy_id',
        expectedVersion: 2,
        claims: [
          {
            name: 'firstName',
            version: 2,
            algorithm: SymmetricKeyEncryptionAlgorithm.AesCbcPkcs7Padding,
            keyId: symmetricKeyId,
            base64Data: Base64.encode(encryptedData),
          },
        ],
        objects: [],
      })

      expect(client.mutate).toHaveBeenCalledWith({
        mutation: UpdateSudoDocument,
        variables: {
          input: {
            id: 'dummy_id',
            expectedVersion: 2,
            claims: [
              {
                name: 'firstName',
                version: 2,
                algorithm: SymmetricKeyEncryptionAlgorithm.AesCbcPkcs7Padding,
                keyId: symmetricKeyId,
                base64Data: Base64.encode(encryptedData),
              },
            ],
            objects: [],
          },
        },
        fetchPolicy: FetchOption.NoCache,
        errorPolicy: ErrorOption.All,
      })
    })

    it('should throw VersionMismatchError when mutation fails', async () => {
      const backendError = createBackendError(
        ['updateSudo'],
        GRAPHQL_ERROR_CONDITIONAL_CHECK_FAILED,
        { message: 'GraphQL error: updateSudo' },
      )

      client.mutate.mockImplementation(() => {
        throw createGraphQLError(backendError)
      })

      try {
        await apiClient.updateSudo({
          id: 'dummy_id',
          expectedVersion: 1,
          claims: [],
          objects: [],
        })
        fail('Expected error not thrown.')
      } catch (error) {
        expect(error).toBeInstanceOf(VersionMismatchError)
      }
    })

    it('should throw FatalError when mutation succeeds but graph response contains no data', async () => {
      client.mutate.mockResolvedValue({
        data: {},
      })

      await expect(
        apiClient.updateSudo({
          id: 'dummy_id',
          expectedVersion: 1,
          claims: [],
          objects: [],
        }),
      ).rejects.toThrow(FatalError)
    })
  }) // updateSudo

  describe('getOwnwershipProof()', () => {
    it('should execute mutation', async () => {
      client.mutate.mockImplementation(async (opts) => {
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

      const result = await apiClient.getOwnershipProof({
        sudoId: 'SUDO_ID',
        audience: 'AUD',
      })

      expect(client.mutate).toHaveBeenCalledWith({
        mutation: GetOwnershipProofDocument,
        variables: {
          input: {
            sudoId: 'SUDO_ID',
            audience: 'AUD',
          },
        },
      })
      expect(result).toEqual({ jwt: 'SUDO_ID//AUD' })
    })
  }) // getOwnershipProof

  describe('redeem()', () => {
    it('should execute mutation', async () => {
      client.mutate.mockImplementation(async (opts) => {
        return {
          data: {
            redeemToken: [
              {
                name: 'sudoplatform.sudo.max',
                value: 0,
              },
            ],
          },
        }
      })

      const entitlements = await apiClient.redeem({
        token: 'sudoplatform.sudo.max=0',
        type: 'entitlements',
      })

      expect(client.mutate).toHaveBeenCalledWith({
        mutation: RedeemTokenDocument,
        variables: {
          input: {
            token: 'sudoplatform.sudo.max=0',
            type: 'entitlements',
          },
        },
      })

      expect(entitlements).toBeTruthy()
      expect(entitlements.length).toEqual(1)
      expect(entitlements[0].name).toEqual('sudoplatform.sudo.max')
      expect(entitlements[0].value).toEqual(0)
    })
  }) // redeem

  describe('listSudos()', () => {
    it('should throw ServiceError when query fails', async () => {
      const backendError = createBackendError(
        ['listSudo'],
        GRAPHQL_ERROR_SERVER_ERROR,
        { message: 'GraphQL error: listSudo' },
      )

      client.query.mockImplementation(() => {
        throw createGraphQLError(backendError)
      })

      await expect(apiClient.listSudos()).rejects.toThrow(ServiceError)
    })

    it('should throw FatalError when mutation succeeds but graph response contains no data', async () => {
      client.query.mockResolvedValue({
        data: null,
      })

      await expect(apiClient.listSudos()).rejects.toThrow(FatalError)
    })
  }) // listSudos

  describe('deleteSudo()', () => {
    it('should execute mutation', async () => {
      client.mutate.mockImplementation(async (_) => {
        return {}
      });

      await apiClient.deleteSudo({
        id: 'SUDO_ID',
        expectedVersion: 2,
      })

      expect(client.mutate).toHaveBeenCalledWith({
        mutation: DeleteSudoDocument,
        variables: {
          input: {
            id: 'SUDO_ID',
            expectedVersion: 2
          },
        },
      })
    })

    it('should throw SudoNotFoundError when sudo id does not exist', async () => {
      const backendError = createBackendError(
        ['deleteSudo'],
        GRAPHQL_ERROR_SUDO_NOT_FOUND,
        { message: 'GraphQL error: deleteSudo' },
      )

      client.mutate.mockImplementation(() => {
        throw createGraphQLError(backendError)
      })

      await expect(apiClient.deleteSudo({
        id: 'RANDOM_ID',
        expectedVersion: 2,
      })).rejects.toThrow(SudoNotFoundError)
    })

    it('should throw VersionMismatchError when expectedVersion is different', async () => {
      client.mutate.mockImplementation(async (_) => {
        return {
          data: {},
          errors: [{
            errorType: 'DynamoDB:ConditionalCheckFailedException',
            message: 'Bad version',
          }],
        }
      });

      await expect(apiClient.deleteSudo({
        id: 'SUDO_ID',
        expectedVersion: 200,
      })).rejects.toThrow(VersionMismatchError)

    })

  }) // deleteSudo

}) // ApiClient
