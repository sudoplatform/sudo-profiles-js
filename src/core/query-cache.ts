import { NormalizedCacheObject } from 'apollo-cache-inmemory'
import AWSAppSyncClient from 'aws-appsync'
import { cloneDeep } from 'lodash'
import { ListSudosQuery, ListSudosDocument, Sudo } from '../gen/graphql-types'
import { graphQLErrorsToClientError } from '../global/error'
import { FetchOption } from '../sudo/sudo'
import { UnknownGraphQLError } from '@sudoplatform/sudo-common'

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
    let cachedData
    try {
      cachedData = await this.client.query<ListSudosQuery>({
        query: ListSudosDocument,
        fetchPolicy: FetchOption.CacheOnly,
      })
    } catch (err) {
      const error = err.graphQLErrors?.[0]
      if (error) {
        throw graphQLErrorsToClientError(error)
      } else {
        throw new UnknownGraphQLError(error)
      }
    }

    const clonedCachedData = cachedData.data?.listSudos?.items?.map((item) => {
      return cloneDeep<Sudo>(item)
    })
    const clonedItem = cloneDeep(item)

    const data: Sudo[] = []
    if (clonedCachedData) {
      data.concat(clonedCachedData)
    }
    data.push(clonedItem)

    const mappedData = {
      listSudos: {
        __typename: 'ModelSudoConnection',
        items: data,
        nextToken: null,
      },
    }

    this.client.writeQuery({
      query: ListSudosDocument,
      data: mappedData,
    })
  }
}
