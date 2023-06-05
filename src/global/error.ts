/*
 * Copyright © 2023 Anonyome Labs, Inc. All rights reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

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

/**
 * Error when the encrypted payload is invalid.
 */
export class InvalidEncryptedDataError extends Error {
  constructor() {
    super('InvalidEncryptedDataError')
  }
}

export class SudoNotFoundError extends Error {
  constructor() {
    super('SudoNotFoundError')
  }
}

/**
 * Error thrown when deleteSudo API is called without initializing the list query
 * cache. Delete API relies on cached information to remove all the data related
 * to a Sudo so it must be called after calling listSudos API to initialize the
 * query and blob cache. The listSudos API is required to be called only once
 * at any time during the lifetime of the client. Typically, this is already done
 * since in order to delete a Sudo you need to retrieve its ID via listSudos.
 */
export class SudoNotFoundInCacheError extends Error {
  constructor() {
    super('SudoNotFoundInCacheError')
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
