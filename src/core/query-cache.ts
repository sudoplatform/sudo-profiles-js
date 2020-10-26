import { NormalizedCacheObject } from 'apollo-cache-inmemory'
import AWSAppSyncClient from 'aws-appsync'
import { ListSudosQuery, ListSudosDocument, Sudo } from '../gen/graphql-types'
import { toPlatformExceptionOrThrow } from '../global/error'
import { FetchOption } from '../sudo/sudo'

/**
 * Wrapper interface for GraphQL client cache operations.
 */
export interface QueryCache {
  /**
   * Adds a new item to the AppSync's query cache.
   *
   * @param item a new item to add to the cache.
   */
  add(item: Sudo): Promise<void>
}

export class DefaultQueryCache implements QueryCache {
  constructor(private client: AWSAppSyncClient<NormalizedCacheObject>) {}

  public async add(item: Sudo): Promise<void> {
    try {
      const cachedSudos = await this.client.query<ListSudosQuery>({
        query: ListSudosDocument,
        fetchPolicy: FetchOption.CacheOnly,
      })

      this.client.writeQuery({
        query: ListSudosDocument,
        data: {
          __typename: 'ModelSudoConnection',
          items: [cachedSudos.data.listSudos, item],
          nextToken: null,
        },
      })
    } catch (error) {
      throw toPlatformExceptionOrThrow(error)
    }
  }
}
