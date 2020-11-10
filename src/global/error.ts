import {
  AppSyncError,
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
 * Error when key not found in KeyStore
 */
export class KeyStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KeyStoreError'
  }
}

/**
 * Error when uploading a file to S3
 */
export class UploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UploadError'
  }
}

/**
 * Error when file not downloaded from S3
 */
export class DownloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DownloadError'
  }
}

/**
 * Error when trying to delete a file from S3
 */
export class DeleteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeleteError'
  }
}

export class SudoNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SudoNotFoundError'
  }
}

export function graphQLErrorsToClientError(error: AppSyncError): Error {
  console.log({ error }, 'GraphQL call failed.')
  const errorType = error.errorType

  switch (errorType) {
    case GRAPHQL_ERROR_SUDO_NOT_FOUND:
      return new SudoNotFoundError(error.message)
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
