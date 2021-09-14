import {
  FatalError,
  isAppSyncNetworkError,
  Logger,
  mapNetworkErrorToClientError,
} from '@sudoplatform/sudo-common'
import { NormalizedCacheObject } from 'apollo-cache-inmemory'
import { Observable } from 'apollo-client/util/Observable'
import { AWSAppSyncClient } from 'aws-appsync'
import { stringType } from 'aws-sdk/clients/iam'
import { GraphQLError } from 'graphql'
import {
  CreateSudoDocument,
  CreateSudoInput,
  CreateSudoMutation,
  DeleteSudoDocument,
  DeleteSudoInput,
  DeleteSudoMutation,
  GetOwnershipProofDocument,
  GetOwnershipProofInput,
  GetOwnershipProofMutation,
  ListSudosDocument,
  ListSudosQuery,
  OnCreateSudoDocument,
  OnCreateSudoSubscription,
  OnDeleteSudoDocument,
  OnDeleteSudoSubscription,
  OnUpdateSudoDocument,
  OnUpdateSudoSubscription,
  OwnershipProof,
  Sudo,
  UpdateSudoDocument,
  UpdateSudoInput,
  UpdateSudoMutation,
} from '../gen/graphql-types'
import { graphQLErrorsToClientError } from '../global/error'
import { ErrorOption, FetchOption } from '../sudo/sudo'

/**
 * AppSync wrapper to use to invoke Sudo Profiles Service APIs.
 */
export class ApiClient {
  private readonly _client: AWSAppSyncClient<NormalizedCacheObject>
  private readonly _logger: Logger

  public constructor(
    client: AWSAppSyncClient<NormalizedCacheObject>,
    logger: Logger,
  ) {
    this._client = client
    this._logger = logger
  }

  public async createSudo(input: CreateSudoInput): Promise<Sudo> {
    let result
    try {
      result = await this._client.mutate<CreateSudoMutation>({
        mutation: CreateSudoDocument,
        variables: { input },
        fetchPolicy: FetchOption.NoCache,
      })
    } catch (err) {
      if (isAppSyncNetworkError(err)) {
        throw mapNetworkErrorToClientError(err)
      }
      throw this.mapGraphQLCallError(err)
    }

    this.checkGraphQLResponseErrors(result.errors)

    return this.returnOrThrow(
      result.data?.createSudo,
      'createSudo did not return any result.',
    )
  }

  public async updateSudo(input: UpdateSudoInput): Promise<Sudo> {
    let result
    try {
      result = await this._client.mutate<UpdateSudoMutation>({
        mutation: UpdateSudoDocument,
        variables: { input },
        fetchPolicy: FetchOption.NoCache,
        errorPolicy: ErrorOption.All,
      })
    } catch (err) {
      if (isAppSyncNetworkError(err)) {
        throw mapNetworkErrorToClientError(err)
      }
      throw this.mapGraphQLCallError(err)
    }

    this.checkGraphQLResponseErrors(result.errors)

    return this.returnOrThrow(
      result.data?.updateSudo,
      'updateSudo did not return any result.',
    )
  }

  public async getOwnershipProof(
    input: GetOwnershipProofInput,
  ): Promise<OwnershipProof> {
    let result
    try {
      result = await this._client.mutate<GetOwnershipProofMutation>({
        mutation: GetOwnershipProofDocument,
        variables: { input },
      })
    } catch (err) {
      if (isAppSyncNetworkError(err)) {
        throw mapNetworkErrorToClientError(err)
      }
      throw this.mapGraphQLCallError(err)
    }

    this.checkGraphQLResponseErrors(result.errors)

    return this.returnOrThrow(
      result.data?.getOwnershipProof,
      'getOwnershipProof did not return any result.',
    )
  }

  public async listSudos(fetchPolicy?: FetchOption): Promise<Sudo[]> {
    let result
    try {
      result = await this._client.query<ListSudosQuery>({
        query: ListSudosDocument,
        fetchPolicy: fetchPolicy,
      })
    } catch (err) {
      if (isAppSyncNetworkError(err)) {
        throw mapNetworkErrorToClientError(err)
      }
      throw this.mapGraphQLCallError(err)
    }

    this.checkGraphQLResponseErrors(result.errors)

    if (result.data) {
      const sudos = result.data.listSudos?.items
      return !sudos ? [] : sudos
    } else {
      throw new FatalError('listSudos did not return any result')
    }
  }

  public async deleteSudo(input: DeleteSudoInput): Promise<void> {
    let result
    try {
      result = await this._client.mutate<DeleteSudoMutation>({
        mutation: DeleteSudoDocument,
        variables: { input },
      })
    } catch (err) {
      if (isAppSyncNetworkError(err)) {
        throw mapNetworkErrorToClientError(err)
      }
      throw this.mapGraphQLCallError(err)
    }

    this.checkGraphQLResponseErrors(result.errors)
  }

  public async reset(): Promise<void> {
    await this._client.resetStore()
  }

  public subscribeToOnCreateSudo(
    owner: string,
  ): Observable<OnCreateSudoSubscription> {
    return this._client.subscribe({
      query: OnCreateSudoDocument,
      variables: { owner },
    })
  }

  public subscribeToOnUpdateSudo(
    owner: string,
  ): Observable<OnUpdateSudoSubscription> {
    return this._client.subscribe({
      query: OnUpdateSudoDocument,
      variables: { owner },
    })
  }

  public subscribeToOnDeleteSudo(
    owner: string,
  ): Observable<OnDeleteSudoSubscription> {
    return this._client.subscribe({
      query: OnDeleteSudoDocument,
      variables: { owner },
    })
  }

  public async getCachedQueryItems(): Promise<Sudo[]> {
    const sudos = await this.listSudos(FetchOption.CacheOnly)
    return !sudos ? <Sudo[]>[] : sudos
  }

  public replaceCachedQueryItems(items: Sudo[]): void {
    const data = {
      listSudos: {
        __typename: 'ModelSudoConnection',
        items,
        nextToken: null,
      },
    }

    this._client.writeQuery({
      query: ListSudosDocument,
      data,
    })
  }

  checkGraphQLResponseErrors = (
    errors: readonly GraphQLError[] | undefined,
  ): void => {
    const error = errors?.[0]
    if (error) {
      throw graphQLErrorsToClientError(error, this._logger)
    }
  }

  /* eslint-disable @typescript-eslint/no-explicit-any*/
  /* eslint-disable @typescript-eslint/explicit-module-boundary-types*/
  mapGraphQLCallError = (err: any): Error => {
    const error = err.graphQLErrors?.[0]
    if (error) {
      return graphQLErrorsToClientError(error, this._logger)
    } else {
      return new FatalError(err.message)
    }
  }

  /* eslint-disable @typescript-eslint/no-explicit-any*/
  /* eslint-disable @typescript-eslint/explicit-module-boundary-types*/
  returnOrThrow = (data: any, message: stringType): any => {
    if (data) {
      return data
    } else {
      throw new FatalError(message)
    }
  }
}
