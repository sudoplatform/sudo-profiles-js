/*
 * Copyright © 2023 Anonyome Labs, Inc. All rights reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, UnknownGraphQLError } from '@sudoplatform/sudo-common'
import { NormalizedCacheObject } from 'apollo-cache-inmemory'
import { ApolloError } from 'apollo-client'
import AWSAppSyncClient from 'aws-appsync'
import { cloneDeep } from 'lodash'
import { ListSudosDocument, ListSudosQuery, Sudo } from '../gen/graphql-types'
import { graphQLErrorsToClientError } from '../global/error'
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
  private readonly _client: AWSAppSyncClient<NormalizedCacheObject>
  private readonly _logger: Logger
  constructor(client: AWSAppSyncClient<NormalizedCacheObject>, logger: Logger) {
    this._client = client
    this._logger = logger
  }

  public async add(item: Sudo): Promise<void> {
    let cachedData
    try {
      cachedData = await this._client.query<ListSudosQuery>({
        query: ListSudosDocument,
        fetchPolicy: FetchOption.CacheOnly,
      })
    } catch (err) {
      const apolloError = err as ApolloError
      const error = apolloError.graphQLErrors?.[0]
      if (error) {
        throw graphQLErrorsToClientError(error, this._logger)
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

    this._client.writeQuery({
      query: ListSudosDocument,
      data: mappedData,
    })
  }
}
