import {
  AppSyncError,
  Logger,
  PolicyError,
  ServiceError,
  UnknownGraphQLError,
  VersionMismatchError,
} from '@sudoplatform/sudo-common'
export const GRAPHQL_ERROR_SUDO_NOT_FOUND = 'sudoplatform.sudo.SudoNotFound'
export const GRAPHQL_ERROR_POLICY_ERROR = 'sudoplatform.PolicyFailed'
export const GRAPHQL_ERROR_CONDITIONAL_CHECK_FAILED =
  'DynamoDB:ConditionalCheckFailedException'
export const GRAPHQL_ERROR_SERVER_ERROR = 'sudoplatform.sudo.ServerError'

/**
 * Error when Symmetric key not found in KeyStore
 */
export declare class SymmetricKeyNotFoundError extends Error {
  constructor()
}

export declare class SudoNotFoundError extends Error {
  constructor()
}

/**
 * Error when uploading a file to S3
 */
export class S3UploadError extends Error {
  constructor(message: string) {
    super(message)
  }
}

/**
 * Error when file not downloaded from S3
 */
export class S3DownloadError extends Error {
  constructor(message: string) {
    super(message)
  }
}

/**
 * Error when trying to delete a file from S3
 */
export class S3DeleteError extends Error {
  constructor(message: string) {
    super(message)
  }
}

export function graphQLErrorsToClientError(
  error: AppSyncError,
  logger: Logger,
): Error {
  logger.error({ error }, 'GraphQL call failed.')
  const errorType = error.errorType

  switch (errorType) {
    case GRAPHQL_ERROR_SUDO_NOT_FOUND:
      return new SudoNotFoundError()
    case GRAPHQL_ERROR_POLICY_ERROR:
      return new PolicyError()
    case GRAPHQL_ERROR_CONDITIONAL_CHECK_FAILED:
      return new VersionMismatchError()
    case GRAPHQL_ERROR_SERVER_ERROR:
      return new ServiceError(error.message)
    default:
      return new UnknownGraphQLError(error)
  }
}
