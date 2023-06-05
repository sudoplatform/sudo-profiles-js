/*
 * Copyright © 2023 Anonyome Labs, Inc. All rights reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FatalError,
  isAppSyncNetworkError,
  Logger,
  mapNetworkErrorToClientError,
} from '@sudoplatform/sudo-common'
import { NormalizedCacheObject } from 'apollo-cache-inmemory'
import { ApolloError } from 'apollo-client'
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
import { SubscriptionResult } from '../sudo/SubscriptionManager'
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
        update: (proxy, mutationResult) => {
          const data = proxy.readQuery<ListSudosQuery>({
            query: ListSudosDocument,
          })

          const newSudo = mutationResult.data?.createSudo

          if (newSudo && data && data.listSudos && data.listSudos.items) {
            // Work around a bug in AppSync that causes "update" to be called
            // multiple times.
            if (!data.listSudos.items.find((item) => item.id === newSudo.id)) {
              data.listSudos.items.push(newSudo)
              proxy.writeQuery({
                query: ListSudosDocument,
                data,
              })
            }
          }
        },
      })
    } catch (err) {
      const error = err as Error
      if (isAppSyncNetworkError(error)) {
        throw mapNetworkErrorToClientError(error)
      }
      throw this.mapGraphQLCallError(error)
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
        errorPolicy: ErrorOption.All,
        update: (proxy, mutationResult) => {
          const data = proxy.readQuery<ListSudosQuery>({
            query: ListSudosDocument,
          })

          const updatedSudo = mutationResult.data?.updateSudo
          if (
            updatedSudo &&
            data &&
            data.listSudos &&
            data.listSudos.items &&
            data.listSudos.items.length > 0
          ) {
            data.listSudos.items = data.listSudos.items.map((item) => {
              if (item.id === updatedSudo.id) {
                return updatedSudo
              } else {
                return item
              }
            })

            proxy.writeQuery({
              query: ListSudosDocument,
              data,
            })
          }
        },
      })
    } catch (err) {
      const error = err as Error
      if (isAppSyncNetworkError(error)) {
        throw mapNetworkErrorToClientError(error)
      }
      throw this.mapGraphQLCallError(error)
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
      const error = err as Error
      if (isAppSyncNetworkError(error)) {
        throw mapNetworkErrorToClientError(error)
      }
      throw this.mapGraphQLCallError(error)
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
      const error = err as Error
      if (isAppSyncNetworkError(error)) {
        throw mapNetworkErrorToClientError(error)
      }
      throw this.mapGraphQLCallError(error)
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
        update: (proxy, mutationResult) => {
          const data = proxy.readQuery<ListSudosQuery>({
            query: ListSudosDocument,
          })

          const deletedSudo = mutationResult.data?.deleteSudo
          if (
            deletedSudo &&
            data &&
            data.listSudos &&
            data.listSudos.items &&
            data.listSudos.items.length > 0
          ) {
            data.listSudos.items = data.listSudos.items.filter(
              (item) => item.id !== deletedSudo.id,
            )

            proxy.writeQuery({
              query: ListSudosDocument,
              data,
            })
          }
        },
      })
    } catch (err) {
      const error = err as Error
      if (isAppSyncNetworkError(error)) {
        throw mapNetworkErrorToClientError(error)
      }
      throw this.mapGraphQLCallError(error)
    }

    this.checkGraphQLResponseErrors(result.errors)
  }

  public async reset(): Promise<void> {
    await this._client.resetStore()
  }

  public subscribeToOnCreateSudo(
    owner: string,
  ): Observable<SubscriptionResult<OnCreateSudoSubscription>> {
    return this._client.subscribe({
      query: OnCreateSudoDocument,
      variables: { owner },
    })
  }

  public subscribeToOnUpdateSudo(
    owner: string,
  ): Observable<SubscriptionResult<OnUpdateSudoSubscription>> {
    return this._client.subscribe({
      query: OnUpdateSudoDocument,
      variables: { owner },
    })
  }

  public subscribeToOnDeleteSudo(
    owner: string,
  ): Observable<SubscriptionResult<OnDeleteSudoSubscription>> {
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

  mapGraphQLCallError = (err: Error): Error => {
    const apolloError = err as ApolloError
    const error = apolloError.graphQLErrors?.[0]
    if (error) {
      return graphQLErrorsToClientError(error, this._logger)
    } else {
      return new FatalError(err.message)
    }
  }

  returnOrThrow = <T>(data: T | undefined, message: stringType): T => {
    if (data) {
      return data
    } else {
      throw new FatalError(message)
    }
  }
}
