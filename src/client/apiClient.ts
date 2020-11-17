import {
  ApiClientConfig,
  DefaultApiClientManager,
} from '@sudoplatform/sudo-api-client'
import {
  DefaultConfigurationManager,
  FatalError,
} from '@sudoplatform/sudo-common'
import { SudoUserClient } from '@sudoplatform/sudo-user'
import { InMemoryCache, NormalizedCacheObject } from 'apollo-cache-inmemory'
import { Observable } from 'apollo-client/util/Observable'
import { AWSAppSyncClient } from 'aws-appsync'
import { GraphQLError } from 'graphql'
import { DefaultQueryCache, QueryCache } from '../core/query-cache'
import {
  CreateSudoDocument,
  CreateSudoInput,
  CreateSudoMutation,
  DeleteSudoDocument,
  DeleteSudoInput,
  DeleteSudoMutation,
  Entitlement,
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
  RedeemTokenDocument,
  RedeemTokenInput,
  RedeemTokenMutation,
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
  private readonly client: AWSAppSyncClient<NormalizedCacheObject>
  private readonly sudoUserClient: SudoUserClient
  private readonly config: ApiClientConfig
  private readonly _queryCache: QueryCache

  public constructor(
    sudoUserClient: SudoUserClient,
    client?: AWSAppSyncClient<NormalizedCacheObject>,
    config?: ApiClientConfig,
    queryCache?: QueryCache,
  ) {
    this.sudoUserClient = sudoUserClient

    this.config =
      config ??
      DefaultConfigurationManager.getInstance().bindConfigSet<ApiClientConfig>(
        ApiClientConfig,
        'apiService',
      )

    if (client) {
      this.client = client
    } else {
      const defaultApiClientManager = DefaultApiClientManager.getInstance()
        .setConfig(this.config)
        .setAuthClient(this.sudoUserClient)
        .getClient()

      defaultApiClientManager.cache = new InMemoryCache()
      this.client = defaultApiClientManager
    }

    this._queryCache = queryCache ?? new DefaultQueryCache(this.client)
  }

  public get queryCache(): QueryCache {
    return this._queryCache
  }

  public async createSudo(input: CreateSudoInput): Promise<Sudo> {
    let result
    try {
      result = await this.client.mutate<CreateSudoMutation>({
        mutation: CreateSudoDocument,
        variables: { input },
        fetchPolicy: FetchOption.NoCache,
      })
    } catch (err) {
      const error = err.graphQLErrors?.[0]
      if (error) {
        throw graphQLErrorsToClientError(error)
      } else {
        throw new FatalError(err.message)
      }
    }

    this.checkGraphQLResponseErrors(result.errors)

    if (result.data?.createSudo) {
      return result.data.createSudo
    } else {
      throw new FatalError('createSudo did not return any result.')
    }
  }

  public async updateSudo(input: UpdateSudoInput): Promise<Sudo> {
    let result
    try {
      result = await this.client.mutate<UpdateSudoMutation>({
        mutation: UpdateSudoDocument,
        variables: { input },
        fetchPolicy: FetchOption.NoCache,
        errorPolicy: ErrorOption.All,
      })
    } catch (err) {
      const error = err.graphQLErrors?.[0]
      if (error) {
        throw graphQLErrorsToClientError(error)
      } else {
        throw new FatalError(err.message)
      }
    }

    this.checkGraphQLResponseErrors(result.errors)

    if (result.data?.updateSudo) {
      return result.data.updateSudo
    } else {
      throw new FatalError('updateSudo did not return any result.')
    }
  }

  public async getOwnershipProof(
    input: GetOwnershipProofInput,
  ): Promise<OwnershipProof> {
    let result
    try {
      result = await this.client.mutate<GetOwnershipProofMutation>({
        mutation: GetOwnershipProofDocument,
        variables: { input },
      })
    } catch (err) {
      const error = err.graphQLErrors?.[0]
      if (error) {
        throw graphQLErrorsToClientError(error)
      } else {
        throw new FatalError(err.message)
      }
    }

    this.checkGraphQLResponseErrors(result.errors)

    if (result.data?.getOwnershipProof) {
      return result.data.getOwnershipProof
    } else {
      throw new FatalError('getOwnershipProof did not return any result.')
    }
  }

  public async redeem(input: RedeemTokenInput): Promise<Entitlement[]> {
    let result
    try {
      result = await this.client.mutate<RedeemTokenMutation>({
        mutation: RedeemTokenDocument,
        variables: { input },
      })
    } catch (err) {
      const error = err.graphQLErrors?.[0]
      if (error) {
        throw graphQLErrorsToClientError(error)
      } else {
        throw new FatalError(err.message)
      }
    }

    this.checkGraphQLResponseErrors(result.errors)

    if (result.data?.redeemToken) {
      return result.data.redeemToken
    } else {
      throw new FatalError('redeem did not return any result.')
    }
  }

  public async listSudos(fetchPolicy?: FetchOption): Promise<Sudo[]> {
    let result
    try {
      result = await this.client.query<ListSudosQuery>({
        query: ListSudosDocument,
        fetchPolicy: fetchPolicy,
      })
    } catch (err) {
      const error = err.graphQLErrors?.[0]
      if (error) {
        throw graphQLErrorsToClientError(error)
      } else {
        throw new FatalError(err.message)
      }
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
      result = await this.client.mutate<DeleteSudoMutation>({
        mutation: DeleteSudoDocument,
        variables: { input },
      })
    } catch (err) {
      const error = err.graphQLErrors?.[0]
      if (error) {
        throw graphQLErrorsToClientError(error)
      } else {
        throw new FatalError(err.message)
      }
    }

    this.checkGraphQLResponseErrors(result.errors)
  }

  public async reset(): Promise<void> {
    await this.client.resetStore()
  }

  checkGraphQLResponseErrors = (
    errors: readonly GraphQLError[] | undefined,
  ): void => {
    const error = errors?.[0]
    if (error) {
      throw graphQLErrorsToClientError(error)
    }
  }

  public subscribeToOnCreateSudo(
    owner: string,
  ): Observable<OnCreateSudoSubscription> {
    return this.client.subscribe({
      query: OnCreateSudoDocument,
      variables: { owner },
    })
  }

  public subscribeToOnUpdateSudo(
    owner: string,
  ): Observable<OnUpdateSudoSubscription> {
    return this.client.subscribe({
      query: OnUpdateSudoDocument,
      variables: { owner },
    })
  }

  public subscribeToOnDeleteSudo(
    owner: string,
  ): Observable<OnDeleteSudoSubscription> {
    return this.client.subscribe({
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

    this.client.writeQuery({
      query: ListSudosDocument,
      data,
    })
  }
}
