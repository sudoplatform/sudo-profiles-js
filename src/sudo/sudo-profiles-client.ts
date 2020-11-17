import { ApiClientConfig } from '@sudoplatform/sudo-api-client'
import {
  DefaultConfigurationManager,
  FatalError,
  IllegalArgumentError,
  IllegalStateError,
  NotSignedInError,
} from '@sudoplatform/sudo-common'
import { SudoUserClient } from '@sudoplatform/sudo-user'
import localForage from 'localforage'
import { ApiClient } from '../client/apiClient'
import { IdentityServiceConfig } from '../core/identity-service-config'
import { KeyManager } from '../core/key-manager'
import { QueryCache } from '../core/query-cache'
import { DefaultS3Client, S3Client } from '../core/s3Client'
import {
  OnCreateSudoSubscription,
  OnDeleteSudoSubscription,
  OnUpdateSudoSubscription,
  SecureClaimInput,
  SecureS3ObjectInput,
  Sudo as GQLSudo,
} from '../gen/graphql-types'
import { AesSecurityProvider } from '../security/aesSecurityProvider'
import {
  SecurityProvider,
  SymmetricKeyEncryptionAlgorithm,
} from '../security/securityProvider'
import { Base64 } from '../utils/base64'
import { Entitlement } from './entitlement'
import { SubscriptionManager } from './SubscriptionManager'
import {
  BlobClaimValue,
  Claim,
  FetchOption,
  StringClaimValue,
  Sudo,
} from './sudo'
import { ChangeType, ConnectionState, SudoSubscriber } from './sudo-subscriber'
import { SudoNotFoundError } from '../global/error'

export enum ClaimVisibility {
  /**
   * Claim is only accessible by the user, i.e. it's encrypted using the user's key.
   */
  Private,
  /**
   * Claim is accessible by other users in Sudo platform.
   */
  Public,
}

/**
 * Interface encapsulating a library of functions for calling Sudo service and managing Sudos.
 */
export interface SudoProfilesClient {
  /**
   * Creates a new Sudo
   *
   * @param sudo Sudo to create.
   *
   * @return Sudo: The new Sudo
   *
   * @throws {@link IllegalStateError}
   * @throws {@link PolicyError}
   * @throws {@link ServiceError}
   * @throws {@link UnknownGraphQLError}
   * @throws {@link FatalError}
   */
  createSudo(sudo: Sudo): Promise<Sudo>

  /**
   * Updates a Sudo.
   *
   * @param sudo Sudo to update.
   * @param keyId new claims keyId
   *
   * @return Sudo: The updated Sudo
   *
   * @throws {@link IllegalArgumentException}
   * @throws {@link IllegalStateError}
   * @throws {@link VersionMismatchError}
   * @throws {@link UploadError}
   * @throws {@link ServiceError}
   * @throws {@link UnknownGraphQLError}
   * @throws {@link FatalError}
   */
  updateSudo(sudo: Sudo, keyId: string): Promise<Sudo>

  /**
   * Retrieves a signed ownership proof for the specified owner. The ownership proof JWT has the
   * following payload.
   * {
   *  "jti": "DBEEF4EB-F84A-4AB7-A45E-02B05B93F5A3",
   *  "owner": "cd73a478-23bd-4c70-8c2b-1403e2085845",
   *  "iss": "sudoplatform.sudoservice",
   *  "aud": "sudoplatform.virtualcardservice",
   *  "exp": 1578986266,
   *  "sub": "da17f346-cf49-4db4-98c2-862f85515fc4",
   *  "iat": 1578982666
   *  }
   *
   *  "owner" is an unique ID of an identity managed by the issuing serivce. In case of Sudo
   *  service this represents unique reference to a Sudo. "sub" is the subject to which this
   *  proof is issued, i.e. the user. "aud" is the target audience of the proof.
   *
   *  @param sudoId Sudo Id to generated an ownership proof for.
   *  @param audience target audience for this proof.
   *
   *  @return String: The JWT
   *
   *  @throws {@link ServiceError}
   *  @throws {@link UnknownGraphQLError}
   *  @throws {@link FatalError}
   */
  getOwnershipProof(sudoId: string, audience: string): Promise<string>

  /**
   * Redeem a token to be granted additional entitlements.
   *
   * @param token Token.
   * @param type Token type. Currently only valid value is "entitlements" but this maybe extended in future.
   *
   * @return List<Entitlement>: A list of entitlements
   *
   *  @throws {@link ServiceError}
   *  @throws {@link UnknownGraphQLError}
   *  @throws {@link FatalError}
   */
  redeem(token: string, type: string): Promise<Entitlement[]>

  /**
   * Retrieves all Sudos owned by the signed in user.
   *
   * @param fetchPolicy: option for controlling the behaviour of this API. Refer to `FetchOption` enum.
   *
   * @return Sudo[]: An array of Sudos
   *
   * @throws {@link DownloadError}
   * @throws {@link ServiceError}
   * @throws {@link UnknownGraphQLError}
   * @throws {@link FatalError}
   */
  listSudos(fetchPolicy?: FetchOption): Promise<Sudo[]>

  /**
   * Reset any internal state and cached content.
   */
  reset(): Promise<void>

  /**
   * Subscribes to be notified of new, updated and deleted Sudos. Blob data is not downloaded automatically
   * so the caller is expected to use `listSudos` API if they need to access any associated blobs.
   *
   * @param id unique ID for the subscriber.
   * @param subscriber subscriber to notify.
   *
   * @throws {@link NotSignedInError}
   */
  subscribeAll(id: string, subscriber: SudoSubscriber): void

  /**
   * Subscribes to be notified of new, updated or deleted Sudos. Blob data is not downloaded automatically
   * so the caller is expected to use `listSudos` API if they need to access any associated blobs.
   *
   * @param id unique ID for the subscriber.
   * @param changeType change type to subscribe to.
   * @param subscriber subscriber to notify.
   *
   * @throws {@link NotSignedInError}
   */
  subscribe(
    id: string,
    changeType: ChangeType,
    subscriber: SudoSubscriber,
  ): void

  /**
   * Unsubscribes the specified subscriber so that it no longer receives notifications about
   * new, updated or deleted Sudos.
   *
   * @param id unique ID for the subscriber.
   * @param changeType change type to unsubscribe from.
   */
  unsubscribe(id: string, changeType: ChangeType): void

  /**
   * Unsubscribe all subscribers from receiving notifications about new, updated or deleted Sudos.
   */
  unsubscribeAll(): void

  /**
   * Deletes a Sudo.
   *
   * @param sudo Sudo to delete.
   *
   * @return void
   *
   * @throws {@link IllegalArgumentError}
   * @throws {@link FatalError}
   * @throws {@link SudoNotFoundError}
   */
  deleteSudo(sudo: Sudo): Promise<void>
}

export class DefaultSudoProfilesClient implements SudoProfilesClient {
  private readonly _apiClient: ApiClient
  private readonly _sudoUserClient: SudoUserClient
  private readonly _keyManager: KeyManager
  private readonly _s3Client: S3Client
  private readonly _securityProvider: SecurityProvider
  private readonly _blobCache: LocalForage

  private readonly _onCreateSudoSubscriptionManager: SubscriptionManager<
    OnCreateSudoSubscription
  >

  private readonly _onUpdateSudoSubscriptionManager: SubscriptionManager<
    OnUpdateSudoSubscription
  >

  private readonly _onDeleteSudoSubscriptionManager: SubscriptionManager<
    OnDeleteSudoSubscription
  >

  constructor(
    sudoUserClient: SudoUserClient,
    keyManager: KeyManager,
    apiClient?: ApiClient,
    config?: ApiClientConfig,
    s3Client?: S3Client,
    queryCache?: QueryCache,
    securityProvider?: SecurityProvider,
    blobCache?: LocalForage,
  ) {
    this._sudoUserClient = sudoUserClient
    this._keyManager = keyManager

    this._blobCache =
      blobCache ??
      localForage.createInstance({
        name: 'sudoProfilesBlobCache',
        driver: localForage.INDEXEDDB,
      })

    this._apiClient =
      apiClient ??
      new ApiClient(this._sudoUserClient, undefined, config, queryCache)

    const identityServiceConfig = DefaultConfigurationManager.getInstance().bindConfigSet<
      IdentityServiceConfig
    >(IdentityServiceConfig, 'identityService')

    this._s3Client =
      s3Client ??
      new DefaultS3Client(this._sudoUserClient, identityServiceConfig)

    this._securityProvider =
      securityProvider ?? new AesSecurityProvider(this._keyManager)

    this._onCreateSudoSubscriptionManager = new SubscriptionManager<
      OnCreateSudoSubscription
    >()
    this._onUpdateSudoSubscriptionManager = new SubscriptionManager()
    this._onDeleteSudoSubscriptionManager = new SubscriptionManager()
  }

  public async createSudo(sudo: Sudo): Promise<Sudo> {
    console.log('Creating a Sudo.')

    const keyId = await this.getSymmetricKeyId()
    if (!keyId) {
      throw new IllegalStateError('Symmetric key missing.')
    }

    const createdSudo = await this._apiClient.createSudo({
      claims: [],
      objects: [],
    })

    sudo.id = createdSudo.id
    sudo.version = createdSudo.version
    sudo.createdAt = new Date(createdSudo.createdAtEpochMs)
    sudo.updatedAt = new Date(createdSudo.updatedAtEpochMs)

    return this.updateSudo(sudo)
  }

  public async updateSudo(sudo: Sudo): Promise<Sudo> {
    console.log('Updating Sudo.')

    if (!sudo.id) {
      throw new IllegalArgumentError('Sudo ID was null')
    }

    const keyId = await this.getSymmetricKeyId()
    if (!keyId) {
      throw new IllegalStateError('Symmetric key missing.')
    }

    const secureClaims: Array<SecureClaimInput> = new Array<SecureClaimInput>()
    const secureS3Objects: Array<SecureS3ObjectInput> = new Array<
      SecureS3ObjectInput
    >()

    for (const [name, claim] of sudo.claims) {
      if (claim.visibility === ClaimVisibility.Private) {
        if (claim.value instanceof BlobClaimValue) {
          if (claim.value.file) {
            const data = claim.value.file

            const cacheId = this.getObjectId(sudo.id, claim.name)
            await this._blobCache.setItem(cacheId, data)

            try {
              // Set claims value for viewing
              const newClaim = new Claim(
                name,
                claim.visibility,
                new BlobClaimValue(cacheId),
              )
              sudo.claims.set(name, newClaim)

              // Setup blob claim for saving
              const encryptedData = await this._securityProvider.encrypt(
                keyId,
                data,
              )
              const key = await this._s3Client.upload(encryptedData, cacheId)

              const secureS3ObjectInput: SecureS3ObjectInput = {
                name: name,
                version: 1,
                algorithm: SymmetricKeyEncryptionAlgorithm.AesCbcPkcs7Padding.toString(),
                keyId: keyId,
                bucket: this._s3Client.bucket,
                region: this._s3Client.region,
                key: key,
              }
              secureS3Objects.push(secureS3ObjectInput)
            } catch (error) {
              await this._blobCache.removeItem(cacheId)
              throw error
            }
          }
        } else if (claim.value instanceof StringClaimValue) {
          if (!claim.value.value) {
            continue
          }
          secureClaims.push(
            await this.createSecureString(name, claim.value.value),
          )
        }
      }
    }

    console.log(`Creating sudo with ${secureClaims.length} claims`)

    const updatedSudo = await this._apiClient.updateSudo({
      id: sudo.id,
      expectedVersion: sudo.version,
      claims: secureClaims,
      objects: secureS3Objects,
    })

    sudo.id = updatedSudo.id
    sudo.version = updatedSudo.version
    sudo.createdAt = new Date(updatedSudo.createdAtEpochMs)
    sudo.updatedAt = new Date(updatedSudo.updatedAtEpochMs)

    await this._apiClient.queryCache.add(updatedSudo)

    return sudo
  }

  public async getOwnershipProof(
    sudoId: string,
    audience: string,
  ): Promise<string> {
    console.log('Calling getOwnerShipProof.')

    const ownershipProof = await this._apiClient.getOwnershipProof({
      sudoId,
      audience,
    })

    return ownershipProof.jwt
  }

  public async redeem(token: string, type: string): Promise<Entitlement[]> {
    console.log('Redeeming a token')

    const entitlement = await this._apiClient.redeem({
      token,
      type,
    })

    return entitlement.map((redeemToken) => {
      return new Entitlement(redeemToken.name, redeemToken.value)
    })
  }

  public async listSudos(fetchPolicy?: FetchOption): Promise<Sudo[]> {
    console.log('Listing Sudos.')

    const sudos = await this._apiClient.listSudos(fetchPolicy)

    return sudos.length > 0
      ? await this.processListSudos(sudos, fetchPolicy, true)
      : []
  }

  public async reset(): Promise<void> {
    console.log('Resetting client.')

    await this._apiClient.reset()
    await this._blobCache.clear()
  }

  public subscribeAll(id: string, subscriber: SudoSubscriber): void {
    this.subscribe(id, ChangeType.Create, subscriber)
    this.subscribe(id, ChangeType.Update, subscriber)
    this.subscribe(id, ChangeType.Delete, subscriber)
  }

  public subscribe(
    id: string,
    changeType: ChangeType,
    subscriber: SudoSubscriber,
  ): void {
    console.log('Subscribing for Sudo change notifications.')

    const owner = this._sudoUserClient.getSubject()
    if (!owner) {
      throw new NotSignedInError()
    }

    switch (changeType) {
      case ChangeType.Create:
        this._onCreateSudoSubscriptionManager.replaceSubscriber(id, subscriber)
        // if subscription manager watcher and subscription hasn't been setup yet
        // create them and watch for sudo changes per `owner`
        if (!this._onCreateSudoSubscriptionManager.watcher) {
          this._onCreateSudoSubscriptionManager.watcher = this._apiClient.subscribeToOnCreateSudo(
            owner,
          )

          this._onCreateSudoSubscriptionManager.subscription = this.executeCreateSudoSubscriptionWatcher()

          this._onCreateSudoSubscriptionManager.connectionStatusChanged(
            ConnectionState.Connected,
          )
        }
        break
      case ChangeType.Update:
        this._onUpdateSudoSubscriptionManager.replaceSubscriber(id, subscriber)
        // if subscription manager watcher and subscription hasn't been setup yet
        // create them and watch for sudo changes per `owner`
        if (!this._onUpdateSudoSubscriptionManager.watcher) {
          this._onUpdateSudoSubscriptionManager.watcher = this._apiClient.subscribeToOnUpdateSudo(
            owner,
          )

          this._onUpdateSudoSubscriptionManager.subscription = this.executeUpdateSudoSubscriptionWatcher()

          this._onUpdateSudoSubscriptionManager.connectionStatusChanged(
            ConnectionState.Connected,
          )
        }
        break
      case ChangeType.Delete:
        this._onDeleteSudoSubscriptionManager.replaceSubscriber(id, subscriber)
        // if subscription manager watcher and subscription hasn't been setup yet
        // create them and watch for sudo changes per `owner`
        if (!this._onDeleteSudoSubscriptionManager.watcher) {
          this._onDeleteSudoSubscriptionManager.watcher = this._apiClient.subscribeToOnDeleteSudo(
            owner,
          )

          this._onDeleteSudoSubscriptionManager.subscription = this.executeDeleteSudoSubscription()

          this._onDeleteSudoSubscriptionManager.connectionStatusChanged(
            ConnectionState.Connected,
          )
        }
        break
      default:
    }
  }

  public unsubscribe(id: string, changeType: ChangeType): void {
    console.log('Unsubscribing from Sudo change notifications.')

    switch (changeType) {
      case ChangeType.Create:
        this._onCreateSudoSubscriptionManager.removeSubscriber(id)
        break
      case ChangeType.Update:
        this._onUpdateSudoSubscriptionManager.removeSubscriber(id)
        break
      case ChangeType.Delete:
        this._onDeleteSudoSubscriptionManager.removeSubscriber(id)
        break
    }
  }

  public unsubscribeAll(): void {
    console.log('Unsubscribing all subscribers from Sudo change notifications.')

    this._onCreateSudoSubscriptionManager.removeAllSubscribers()
    this._onUpdateSudoSubscriptionManager.removeAllSubscribers()
    this._onDeleteSudoSubscriptionManager.removeAllSubscribers()
  }

  private executeCreateSudoSubscriptionWatcher():
    | ZenObservable.Subscription
    | undefined {
    const subscription = this._onCreateSudoSubscriptionManager.watcher?.subscribe(
      {
        complete: () => {
          console.log('Completed onCreateSudo subscription')
          // Subscription was terminated. Notify the subscribers.
          this._onCreateSudoSubscriptionManager.connectionStatusChanged(
            ConnectionState.Disconnected,
          )
        },
        error: (error) => {
          console.log('Failed to create a subscription', error)
          //Notify the subscribers.
          this._onCreateSudoSubscriptionManager.connectionStatusChanged(
            ConnectionState.Disconnected,
          )
        },

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        next: async (result: any): Promise<void> => {
          console.log('executing onCreateSudo subscription', result)
          const data = (result.data as OnCreateSudoSubscription)?.onCreateSudo
          if (!data) {
            throw new FatalError(
              'onCreateSudo subscription response contained error',
            )
          } else {
            console.log('onCreateSudo subscription worked', data)
            const items: GQLSudo[] = [data]
            const sudos = await this.processListSudos(
              items,
              FetchOption.CacheOnly,
              false,
            )
            if (sudos?.length > 0) {
              // Add new item to cache
              const sudo = sudos[0]
              const cachedItems = await this._apiClient.getCachedQueryItems()
              console.log(
                `Found ${cachedItems?.length} in listsudosquery cache`,
              )
              if (cachedItems) {
                cachedItems.push(items[0])

                this._apiClient.replaceCachedQueryItems(cachedItems)
              }

              this._onCreateSudoSubscriptionManager.sudoChanged(
                ChangeType.Create,
                sudo,
              )
            } else {
              console.log('No sudos found in cache')
            }
          }
          return Promise.resolve()
        },
      },
    )

    return subscription
  }

  public async deleteSudo(sudo: Sudo): Promise<void> {
    console.log('delete sudo')

    const sudoId = sudo.id
    if (!sudoId) {
      throw new IllegalArgumentError('No SudoId found.')
    }

    await this.deleteSecureS3Object(sudoId)

    await this._apiClient.deleteSudo({
      id: sudoId,
      expectedVersion: sudo.version,
    })
  }

  private async deleteSecureS3Object(sudoId: string): Promise<void> {
    const sudo = await this.getSudo(sudoId)
    if (!sudo) {
      throw new SudoNotFoundError()
    }

    for (const [name, claim] of sudo.claims) {
      if (
        claim.visibility == ClaimVisibility.Private &&
        claim.value instanceof BlobClaimValue
      ) {
        const cacheId = this.getObjectId(sudoId, name)
        if (cacheId) {
          const cacheEntry = await this._blobCache.getItem(cacheId)
          if (cacheEntry) {
            await this._s3Client.delete(cacheId)
            this._blobCache.removeItem(cacheId)
          }
        }
      }
    }
  }

  private async getSudo(id: string): Promise<Sudo | undefined> {
    return (await this.listSudos(FetchOption.CacheOnly)).find((sudo) => {
      return sudo.id === id
    })
  }

  private executeUpdateSudoSubscriptionWatcher():
    | ZenObservable.Subscription
    | undefined {
    const subscription = this._onUpdateSudoSubscriptionManager.watcher?.subscribe(
      {
        complete: () => {
          console.log('Completed onUpdateSudo subscription')
          // Subscription was terminated. Notify the subscribers.
          this._onUpdateSudoSubscriptionManager.connectionStatusChanged(
            ConnectionState.Disconnected,
          )
        },
        error: (error) => {
          console.log('Failed to update a subscription', error)
          //Notify the subscribers.
          this._onUpdateSudoSubscriptionManager.connectionStatusChanged(
            ConnectionState.Disconnected,
          )
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        next: async (result: any): Promise<void> => {
          console.log('executing onUpdateSudo subscription', result)
          const data = (result.data as OnUpdateSudoSubscription)?.onUpdateSudo
          if (!data) {
            throw new FatalError(
              'onUpdateSudo subscription response contained error',
            )
          } else {
            console.log('onUpdateSudo subscription worked', data)
            const items: GQLSudo[] = [data]
            const sudos = await this.processListSudos(
              items,
              FetchOption.CacheOnly,
              false,
            )

            if (sudos?.length > 0) {
              // Add new item to cache
              const sudo = sudos[0]
              const cachedItems = (
                await this._apiClient.getCachedQueryItems()
              ).filter((element) => {
                return element.id !== items[0].id
              })
              console.log(
                `Found ${cachedItems?.length} in listsudosquery cache`,
              )
              if (cachedItems) {
                cachedItems.push(items[0])
                this._apiClient.replaceCachedQueryItems(cachedItems)
              }

              this._onUpdateSudoSubscriptionManager.sudoChanged(
                ChangeType.Update,
                sudo,
              )
            } else {
              console.log('No sudos found in cache')
            }
          }

          return Promise.resolve()
        },
      },
    )

    return subscription
  }

  private executeDeleteSudoSubscription():
    | ZenObservable.Subscription
    | undefined {
    const subscription = this._onDeleteSudoSubscriptionManager.watcher?.subscribe(
      {
        complete: () => {
          console.log('Completed onDeleteSudo subscription')
          // Subscription was terminated. Notify the subscribers.
          this._onDeleteSudoSubscriptionManager.connectionStatusChanged(
            ConnectionState.Disconnected,
          )
        },
        error: (error) => {
          console.log('Failed to update a subscription', error)
          //Notify the subscribers.
          this._onDeleteSudoSubscriptionManager.connectionStatusChanged(
            ConnectionState.Disconnected,
          )
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        next: async (result: any): Promise<void> => {
          console.log('executing onDeleteSudo subscription', result)
          const data = (result.data as OnDeleteSudoSubscription)?.onDeleteSudo
          if (!data) {
            throw new FatalError(
              'onDeleteSudo subscription response contained error',
            )
          } else {
            console.log('onDeleteSudo subscription worked', data)
            const items: GQLSudo[] = [data]
            const sudos = await this.processListSudos(
              items,
              FetchOption.CacheOnly,
              false,
            )
            if (sudos?.length > 0) {
              const sudo = sudos[0]
              const cachedItems = await this._apiClient.getCachedQueryItems()
              console.log(
                `Found ${cachedItems?.length} in listsudosquery cache`,
              )
              if (cachedItems) {
                this._apiClient.replaceCachedQueryItems(
                  cachedItems.filter((element) => {
                    return element.id !== sudo.id
                  }),
                )

                this._onDeleteSudoSubscriptionManager.sudoChanged(
                  ChangeType.Delete,
                  sudo,
                )
              }
            } else {
              console.log('No sudos found in cache')
            }
          }
          return Promise.resolve()
        },
      },
    )
    return subscription
  }

  /**
   * Map between ListSudosQuery.Item and Sudo
   * @param items
   * @param option
   * @param processS3Object
   */
  private async processListSudos(
    items: GQLSudo[],
    option?: FetchOption,
    processS3Object: boolean = false,
  ): Promise<Sudo[]> {
    const sudos: Sudo[] = []

    console.log(`Listing ${items.length} sudos`)
    for (const item of items) {
      const claimsMap = new Map<string, Claim>()
      await Promise.all(
        item.claims.map(async (claim) => {
          const decryptedClaim = await this.processSecureClaim(
            claim.name,
            claim.keyId,
            claim.base64Data,
          )
          claimsMap.set(claim.name, decryptedClaim)
        }),
      )

      const metadataMap = new Map<string, string>()
      item.metadata.map((metadata) => {
        metadataMap.set(metadata.name, metadata.value)
      })

      const sudo = new Sudo(
        item.id,
        item.version,
        new Date(item.createdAtEpochMs),
        new Date(item.updatedAtEpochMs),
        metadataMap,
        claimsMap,
      )

      if (processS3Object) {
        console.log('Found S3objects to process: ', item.objects.length)
        for (const secureObject of item.objects) {
          // Check if we already have the S3 object in the cache. Return the cache entry
          // if asked to fetch from cache but otherwise download the S3 object.
          if (option === FetchOption.CacheOnly) {
            const cacheId = this.getObjectId(item.id, secureObject.name)
            if (!cacheId) {
              console.log('Cannot determine the object ID from the key.')
            } else {
              const entry = (await this._blobCache.getItem(
                cacheId,
              )) as ArrayBuffer
              if (entry) {
                sudo.claims.set(
                  secureObject.name,
                  new Claim(
                    secureObject.name,
                    ClaimVisibility.Private,
                    new BlobClaimValue(cacheId, entry),
                  ),
                )
              }
            }
          } else {
            const data = await this._s3Client.download(secureObject.key)
            const decryptedData = await this._securityProvider.decrypt(
              secureObject.keyId,
              data,
            )
            const cacheId = this.getObjectId(item.id, secureObject.name)
            if (!cacheId) {
              throw new Error('Key not found for blob claim.')
            }
            await this._blobCache.setItem(cacheId, decryptedData)
            const blobClaim = new Claim(
              secureObject.name,
              ClaimVisibility.Private,
              new BlobClaimValue(cacheId, decryptedData),
            )
            sudo.claims.set(secureObject.name, blobClaim)
          }
        }
      }

      sudos.push(sudo)
    }

    return sudos
  }

  private getObjectId(sudoId: string, name: string): string {
    return `sudo/${sudoId}/${name}`
  }

  private async getSymmetricKeyId(): Promise<string | undefined> {
    return await this._keyManager.getSymmetricKeyId()
  }

  private async loadFileAsArrayBuffer(
    file: File,
  ): Promise<ArrayBuffer | undefined> {
    const reader = new FileReader()

    return new Promise((resolve, reject) => {
      reader.onerror = () => {
        reader.abort()
        reject('Problem parsing file')
      }

      reader.onload = () => {
        const result = reader.result
        if (result instanceof ArrayBuffer) {
          resolve(result)
        } else {
          resolve(undefined)
        }
      }

      reader.readAsArrayBuffer(file)
    })
  }

  protected async createSecureString(
    name: string,
    value: string,
  ): Promise<SecureClaimInput> {
    const keyId = await this.getSymmetricKeyId()
    if (!keyId) {
      throw new FatalError('No symmetric key found.')
    }

    const textEncoder = new TextEncoder()
    const byteArray = textEncoder.encode(value)
    const encryptedData = await this._securityProvider.encrypt(keyId, byteArray)

    const input: SecureClaimInput = {
      name: name,
      version: 1,
      algorithm: SymmetricKeyEncryptionAlgorithm.AesCbcPkcs7Padding.toString(),
      keyId: keyId,
      base64Data: Base64.encode(encryptedData),
    }

    return input
  }

  private async processSecureClaim(
    name: string,
    keyId: string,
    base64Data: string,
  ): Promise<Claim> {
    const decryptedData = await this._securityProvider.decrypt(
      keyId,
      Base64.decode(base64Data),
    )

    const textDecoder = new TextDecoder()
    const decodedString = textDecoder.decode(decryptedData)

    return new Claim(
      name,
      ClaimVisibility.Private,
      new StringClaimValue(decodedString),
    )
  }
}
