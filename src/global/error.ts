import { ApolloError } from 'apollo-client'
import { GraphQLError } from 'graphql'

export const GRAPHQL_ERROR_SUDO_NOT_FOUND = 'sudoplatform.sudo.SudoNotFound'
export const GRAPHQL_ERROR_POLICY_ERROR = 'sudoplatform.PolicyFailed'
export const GRAPHQL_ERROR_CONDITIONAL_CHECK_FAILED =
  'DynamoDB:ConditionalCheckFailedException'
export const GRAPHQL_ERROR_SERVER_ERROR = 'sudoplatform.sudo.ServerError'

type AppSyncGraphQLError = GraphQLError & {
  errorType?: string | null
}

type GraphQLErrorParent = ApolloError & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  graphQLErrors?: any[] | null
}

/**
 * Error for wrapping exceptions such as `ApolloException` and all other `Exceptions`
 */
export class FatalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FatalError'
  }
}

/**
 * Error when expected arguments are missing
 */
export class IllegalArgumentException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IllegalArgumentException'
  }
}

/**
 * Error when key not found in KeyStore
 */
export class KeyStoreException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KeyStoreException'
  }
}

export class SudoProfileException extends Error {}

export class SudoNotFoundException extends SudoProfileException {
  constructor(message: string) {
    super(message)
    this.name = 'SudoNotFoundException'
  }
}

export class PolicyFailedException extends SudoProfileException {
  constructor(message: string) {
    super(message)
    this.name = 'PolicyFailedException'
  }
}

export class ConditionalCheckFailedException extends SudoProfileException {
  constructor(message: string) {
    super(message)
    this.name = 'ConditionalCheckFailedException'
  }
}

export class InternalServerException extends SudoProfileException {
  constructor(message: string) {
    super(message)
    this.name = 'InternalServerException'
  }
}

export class GraphQlException extends SudoProfileException {
  constructor(message: string) {
    super(message)
    this.name = 'GraphQlException'
  }
}

export function toSudoProfileException(
  error: AppSyncGraphQLError,
): SudoProfileException {
  const errorType = error.errorType
  console.log(
    `SudoProfileException: Type: ${errorType} Message: ${error.message}`,
  )
  switch (errorType) {
    case GRAPHQL_ERROR_SUDO_NOT_FOUND:
      return new SudoNotFoundException(error.message)
    case GRAPHQL_ERROR_POLICY_ERROR:
      return new PolicyFailedException(error.message)
    case GRAPHQL_ERROR_CONDITIONAL_CHECK_FAILED:
      return new ConditionalCheckFailedException(error.message)
    case GRAPHQL_ERROR_SERVER_ERROR:
      return new InternalServerException(error.message)
    default:
      return new GraphQlException(error.message)
  }
}

export function toPlatformExceptionOrThrow(error: Error): Error {
  const graphError = error as GraphQLErrorParent

  if (graphError.graphQLErrors) {
    return toSudoProfileException(graphError.graphQLErrors[0])
  } else if (error instanceof ApolloError) {
    return toSudoProfileException(error.graphQLErrors[0])
  } else {
    console.log(error.message)
    return new FatalError(error.message)
  }
}
