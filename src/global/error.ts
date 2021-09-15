import {
  AppSyncError,
  InsufficientEntitlementsError,
  Logger,
  ServiceError,
  UnknownGraphQLError,
  VersionMismatchError,
} from '@sudoplatform/sudo-common'
export const GRAPHQL_ERROR_SUDO_NOT_FOUND = 'sudoplatform.sudo.SudoNotFound'
export const GRAPHQL_ERROR_INSUFFICIENT_ENTITLEMENTS_ERROR =
  'sudoplatform.InsufficientEntitlementsError'
export const GRAPHQL_ERROR_CONDITIONAL_CHECK_FAILED =
  'DynamoDB:ConditionalCheckFailedException'
export const GRAPHQL_ERROR_SERVER_ERROR = 'sudoplatform.sudo.ServerError'

/**
 * Error when Symmetric key not found in KeyStore
 */
export class SymmetricKeyNotFoundError extends Error {
  constructor() {
    super('SymmetricKeyNotFoundError')
  }
}

export class SudoNotFoundError extends Error {
  constructor() {
    super('SudoNotFoundError')
  }
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

/**
 * Indicates that Sudo Service is not deployed into your runtime instance or the config
 * file that you are using is invalid.
 */
export class SudoServiceConfigNotFoundError extends Error {
  constructor(message?: string) {
    super(message)
  }
}

/**
 * Indicates that the configuration that was passed to `SudoProfilesClient` instance
 * was invalid.
 */
export class InvalidConfigError extends Error {
  constructor(message?: string) {
    super(message)
  }
}

export function graphQLErrorsToClientError(
  error: AppSyncError,
  logger: Logger,
): Error {
  logger.error('GraphQL call failed.', { error })
  const errorType = error.errorType

  switch (errorType) {
    case GRAPHQL_ERROR_SUDO_NOT_FOUND:
      return new SudoNotFoundError()
    case GRAPHQL_ERROR_INSUFFICIENT_ENTITLEMENTS_ERROR:
      return new InsufficientEntitlementsError()
    case GRAPHQL_ERROR_CONDITIONAL_CHECK_FAILED:
      return new VersionMismatchError()
    case GRAPHQL_ERROR_SERVER_ERROR:
      return new ServiceError(error.message)
    default:
      return new UnknownGraphQLError(error)
  }
}
