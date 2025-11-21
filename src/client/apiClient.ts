/*
 * Copyright © 2023 Anonyome Labs, Inc. All rights reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FatalError,
  isGraphQLNetworkError,
  Logger,
  mapNetworkErrorToClientError,
} from '@sudoplatform/sudo-common'
import { GraphQLError } from 'graphql'
import Observable from 'zen-observable'
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
import { FetchOption } from '../sudo/sudo'
import { GraphQLClient } from '@sudoplatform/sudo-user'

/**
 * AppSync wrapper to use to invoke Sudo Profiles Service APIs.
 */
export class ApiClient {
  private readonly _client: GraphQLClient
  private readonly _logger: Logger

  private _cache: Sudo[] | null = null
  private _cachePromise: Promise<void> | null = null
  public constructor(client: GraphQLClient, logger: Logger) {
    this._client = client
    this._logger = logger
  }

  public async createSudo(input: CreateSudoInput): Promise<Sudo> {
    let result
    try {
      result = await this._client.mutate<CreateSudoMutation>({
        mutation: CreateSudoDocument,
        variables: { input },
      })
      // Update the cache by inserting the new Sudo:
      const existingSudos = await this.getCachedQueryItems()
      const newSudo = result.data?.createSudo
      if (newSudo && !existingSudos.find((item) => item.id === newSudo.id)) {
        existingSudos.push(newSudo)
      }

      await this.replaceCachedQueryItems(existingSudos)
    } catch (err) {
      const error = err as Error
      if (isGraphQLNetworkError(error)) {
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
      })
      // Update the modified sudo in the cache
      let existingSudos = await this.getCachedQueryItems()
      const updatedSudo = result.data?.updateSudo
      if (updatedSudo && existingSudos.length > 0) {
        existingSudos = existingSudos.map((item) =>
          item.id !== updatedSudo.id ? item : updatedSudo,
        )
      }
      await this.replaceCachedQueryItems(existingSudos)
    } catch (err) {
      const error = err as Error
      if (isGraphQLNetworkError(error)) {
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
      if (isGraphQLNetworkError(error)) {
        throw mapNetworkErrorToClientError(error)
      }
      throw this.mapGraphQLCallError(error)
    }

    this.checkGraphQLResponseErrors(result?.errors)

    return this.returnOrThrow(
      result.data?.getOwnershipProof,
      'getOwnershipProof did not return any result.',
    )
  }

  public async listSudos(fetchPolicy?: FetchOption): Promise<Sudo[]> {
    let result
    let cachedSudos: Sudo[] = []
    let networkSudos: Sudo[] = []
    const cachePolicyToUse = fetchPolicy ?? FetchOption.CacheFirst // The Apollo default

    try {
      // We have to determine the cache behaviour and act accordingly because we are managing
      // the cache ourselves.
      if (this.fetchPolicyRequiresCacheRead(cachePolicyToUse)) {
        cachedSudos = await this.getCachedQueryItems()
      }
      if (this.fetchPolicyRequiresNetworkFetch(cachePolicyToUse, cachedSudos)) {
        result = await this._client.query<ListSudosQuery>({
          query: ListSudosDocument,
        })
        if (result.data.listSudos?.items) {
          if (cachePolicyToUse != FetchOption.NoCache) {
            await this.replaceCachedQueryItems(result.data.listSudos.items)
          }
          networkSudos = result.data.listSudos.items
        }
      }
    } catch (err) {
      const error = err as Error
      if (isGraphQLNetworkError(error)) {
        throw mapNetworkErrorToClientError(error)
      }
      throw this.mapGraphQLCallError(error)
    }

    this.checkGraphQLResponseErrors(result?.errors ?? [])
    let sudos: Sudo[] = []
    switch (cachePolicyToUse) {
      case FetchOption.CacheFirst:
        sudos = cachedSudos.length > 0 ? cachedSudos : networkSudos
        break
      case FetchOption.RemoteOnly:
      case FetchOption.NoCache:
        sudos = networkSudos
        break
      case FetchOption.CacheOnly:
        sudos = cachedSudos
        break
      case FetchOption.CacheAndRemote:
        sudos = this.mergeSudoArrays(cachedSudos, networkSudos)
        break
    }
    return sudos
  }

  public async deleteSudo(input: DeleteSudoInput): Promise<void> {
    let result
    try {
      result = await this._client.mutate<DeleteSudoMutation>({
        mutation: DeleteSudoDocument,
        variables: { input },
      })
      // Update the cache by removing the deleted Sudo:
      let existingSudos = await this.getCachedQueryItems()
      const deletedSudo = result.data?.deleteSudo
      if (deletedSudo && existingSudos.length > 0) {
        existingSudos = existingSudos.filter(
          (item) => item.id !== deletedSudo.id,
        )
      }
      await this.replaceCachedQueryItems(existingSudos)
    } catch (err) {
      const error = err as Error
      if (isGraphQLNetworkError(error)) {
        throw mapNetworkErrorToClientError(error)
      }
      throw this.mapGraphQLCallError(error)
    }

    this.checkGraphQLResponseErrors(result.errors)
  }

  public async reset(): Promise<void> {}

  public subscribeToOnCreateSudo(
    owner: string,
  ): Promise<Observable<SubscriptionResult<OnCreateSudoSubscription>>> {
    return this._client.subscribe({
      subscription: OnCreateSudoDocument,
      variables: { owner },
    })
  }

  public subscribeToOnUpdateSudo(
    owner: string,
  ): Promise<Observable<SubscriptionResult<OnUpdateSudoSubscription>>> {
    return this._client.subscribe({
      subscription: OnUpdateSudoDocument,
      variables: { owner },
    })
  }

  public subscribeToOnDeleteSudo(
    owner: string,
  ): Promise<Observable<SubscriptionResult<OnDeleteSudoSubscription>>> {
    return this._client.subscribe({
      subscription: OnDeleteSudoDocument,
      variables: { owner },
    })
  }

  public async getCachedQueryItems(): Promise<Sudo[]> {
    // Return a copy to prevent external mutation
    return await this.withCacheLock(() =>
      Promise.resolve([...(this._cache ?? [])]),
    )
  }

  public async replaceCachedQueryItems(items: Sudo[]): Promise<void> {
    await this.withCacheLock(() => {
      this._cache = [...items]
      return Promise.resolve()
    })
  }

  checkGraphQLResponseErrors = (errors: GraphQLError[] | undefined): void => {
    const error = errors?.[0]
    if (error) {
      throw graphQLErrorsToClientError(error, this._logger)
    }
  }

  mapGraphQLCallError = (err: Error): Error => {
    if ('graphQLErrors' in err && Array.isArray(err.graphQLErrors)) {
      const error = err.graphQLErrors[0] as { errorType: string }
      if (error) {
        return graphQLErrorsToClientError(error, this._logger)
      }
    }
    if ('errorType' in err) {
      return graphQLErrorsToClientError(
        err as { errorType: string },
        this._logger,
      )
    }
    return new FatalError(err.message)
  }

  returnOrThrow = <T>(data: T | undefined, message: string): T => {
    if (data) {
      return data
    } else {
      throw new FatalError(message)
    }
  }

  private async withCacheLock<T>(operation: () => Promise<T>): Promise<T> {
    // Wait for any pending cache operation to complete
    while (this._cachePromise) {
      await this._cachePromise
    }

    // Execute the operation with a new promise to block other operations
    const promise = (async () => {
      try {
        return await operation()
      } finally {
        this._cachePromise = null
      }
    })()

    this._cachePromise = promise.then(() => {})
    return promise
  }

  private mergeSudoArrays(existingArray: Sudo[], newArray: Sudo[]): Sudo[] {
    const merged = [...existingArray]

    newArray.forEach((newSudo) => {
      const existingIndex = merged.findIndex(
        (existing) => existing.id === newSudo.id,
      )
      if (existingIndex !== -1) {
        merged[existingIndex] = newSudo // Overwrite existing
      } else {
        merged.push(newSudo) // Add new
      }
    })

    return merged
  }

  private fetchPolicyRequiresCacheRead(cachePolicyToUse: FetchOption): boolean {
    return (
      cachePolicyToUse === FetchOption.CacheFirst ||
      cachePolicyToUse === FetchOption.CacheOnly ||
      cachePolicyToUse === FetchOption.CacheAndRemote
    )
  }

  private fetchPolicyRequiresNetworkFetch(
    cachePolicyToUse: FetchOption,
    cachedSudos: Sudo[],
  ): boolean {
    return (
      cachePolicyToUse === FetchOption.CacheAndRemote ||
      cachePolicyToUse === FetchOption.RemoteOnly ||
      cachePolicyToUse === FetchOption.NoCache ||
      (cachePolicyToUse === FetchOption.CacheFirst && cachedSudos.length === 0)
    )
  }
}
