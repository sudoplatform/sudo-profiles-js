import {
  Base64,
  DefaultLogger,
  FatalError,
  InsufficientEntitlementsError,
  ServiceError,
  VersionMismatchError,
} from '@sudoplatform/sudo-common'
import { ApolloError } from 'apollo-client'
import { AWSAppsyncGraphQLError } from 'aws-appsync/lib/types'
import { GraphQLError } from 'graphql'
import { ApiClient } from '../../src/client/apiClient'
import {
  CreateSudoDocument,
  DeleteSudoDocument,
  GetOwnershipProofDocument,
  UpdateSudoDocument,
} from '../../src/gen/graphql-types'
import {
  GRAPHQL_ERROR_CONDITIONAL_CHECK_FAILED,
  GRAPHQL_ERROR_INSUFFICIENT_ENTITLEMENTS_ERROR,
  GRAPHQL_ERROR_SERVER_ERROR,
  GRAPHQL_ERROR_SUDO_NOT_FOUND,
  SudoNotFoundError,
} from '../../src/global/error'

const globalAny: any = global
globalAny.WebSocket = require('ws')
require('isomorphic-fetch')
// eslint-disable-next-line @typescript-eslint/no-var-requires
global.crypto = require('crypto').webcrypto

const symmetricKeyEncryptionAlgorithm = 'AES/CBC/PKCS7Padding'

const client = {
  mutate: jest.fn(),
  query: jest.fn(),
}
const logger = new DefaultLogger('apiClient tests')

const apiClient = new ApiClient(client as any, logger)

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
      client.mutate.mockImplementation((options) => {
        expect(options.mutation).toEqual(CreateSudoDocument)
        expect(options.variables).toEqual({
          input: {
            claims: [],
            objects: [],
          },
        })
        return {
          data: {
            createSudo: {
              id: 'SUDO_ID',
            },
            updateSudo: {
              id: 'SUDO_ID',
            },
          },
        }
      })

      const result = await apiClient.createSudo({
        claims: [],
        objects: [],
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

    it('should throw InsufficientEntitlementsError when mutation fails', async () => {
      const backendError = createBackendError(
        ['createSudo'],
        GRAPHQL_ERROR_INSUFFICIENT_ENTITLEMENTS_ERROR,
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
        expect(error).toBeInstanceOf(InsufficientEntitlementsError)
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

      client.mutate.mockImplementation((options) => {
        expect(options.mutation).toEqual(UpdateSudoDocument)
        expect(options.variables).toEqual({
          input: {
            id: 'dummy_id',
            expectedVersion: 2,
            claims: [
              {
                name: 'firstName',
                version: 2,
                algorithm: symmetricKeyEncryptionAlgorithm,
                keyId: symmetricKeyId,
                base64Data: Base64.encode(encryptedData),
              },
            ],
            objects: [],
          },
        })
        return {
          data: {
            updateSudo: {
              id: 'dummy_id',
              version: 2,
              createdAtEpochMs: epoch,
              updatedAtEpochMs: epoch,
            },
          },
        }
      })

      await apiClient.updateSudo({
        id: 'dummy_id',
        expectedVersion: 2,
        claims: [
          {
            name: 'firstName',
            version: 2,
            algorithm: symmetricKeyEncryptionAlgorithm,
            keyId: symmetricKeyId,
            base64Data: Base64.encode(encryptedData),
          },
        ],
        objects: [],
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
      client.mutate.mockImplementation((opts) => {
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
      client.mutate.mockImplementation((options) => {
        expect(options.mutation).toEqual(DeleteSudoDocument)
        expect(options.variables).toEqual({
          input: {
            id: 'SUDO_ID',
            expectedVersion: 2,
          },
        })
        return {}
      })

      await apiClient.deleteSudo({
        id: 'SUDO_ID',
        expectedVersion: 2,
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

      await expect(
        apiClient.deleteSudo({
          id: 'RANDOM_ID',
          expectedVersion: 2,
        }),
      ).rejects.toThrow(SudoNotFoundError)
    })

    it('should throw VersionMismatchError when expectedVersion is different', async () => {
      client.mutate.mockImplementation(() => {
        return {
          data: {},
          errors: [
            {
              errorType: 'DynamoDB:ConditionalCheckFailedException',
              message: 'Bad version',
            },
          ],
        }
      })

      await expect(
        apiClient.deleteSudo({
          id: 'SUDO_ID',
          expectedVersion: 200,
        }),
      ).rejects.toThrow(VersionMismatchError)
    })
  }) // deleteSudo
}) // ApiClient
