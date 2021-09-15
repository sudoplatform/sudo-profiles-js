import { DefaultApiClientManager } from '@sudoplatform/sudo-api-client'
import {
  Base64,
  DecodeError,
  DefaultConfigurationManager,
  DefaultLogger,
  DefaultSudoKeyManager,
  FatalError,
  IllegalArgumentError,
  IllegalStateError,
  Logger,
  NotSignedInError,
  SudoKeyManager,
} from '@sudoplatform/sudo-common'
import { SudoUserClient } from '@sudoplatform/sudo-user'
import localForage from 'localforage'
import { ApiClient } from '../client/apiClient'
import {
  IdentityServiceConfig,
  IdentityServiceConfigCodec,
} from '../core/identity-service-config'
import { DefaultS3Client, S3Client } from '../core/s3Client'
import {
  SudoServiceConfig,
  SudoServiceConfigCodec,
} from '../core/sudo-service-config'
import {
  OnCreateSudoSubscription,
  OnDeleteSudoSubscription,
  OnUpdateSudoSubscription,
  SecureClaimInput,
  SecureS3ObjectInput,
  Sudo as GQLSudo,
} from '../gen/graphql-types'
import {
  SudoNotFoundError,
  SudoServiceConfigNotFoundError,
} from '../global/error'
import { SubscriptionManager, SubscriptionResult } from './SubscriptionManager'
import {
  BlobClaimValue,
  Claim,
  FetchOption,
  StringClaimValue,
  Sudo,
} from './sudo'
import { ChangeType, ConnectionState, SudoSubscriber } from './sudo-subscriber'
import { WebSudoCryptoProvider } from '@sudoplatform/sudo-web-crypto-provider'

export interface SudoProfileOptions {
  sudoUserClient: SudoUserClient
  apiClient?: ApiClient
  s3Client?: S3Client
  blobCache?: typeof localForage
  logger?: Logger
  keyManager?: SudoKeyManager
}

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
   * @throws {@link InsufficientEntitlementsError}
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

  /**
   * Adds a key value pair to the store (keyId, key), then sets that keyId as the pointer to the current symmetric key to use.
   *
   * As symmetric keys can be rotated, this will also allow a list of symmetric keys to exist in the store in which to decrypt
   * older sudo claims with if needed and also give the ability to set the current symmetric key.
   *
   * The last symmetric key pushed will be set to the current active symmetric key.
   *
   * @param keyId The keyId that points to the symmetric key used for encrypting claims
   * @param key The symmetric key to encrypt claims with
   */
  pushSymmetricKey(keyId: string, key: string): Promise<void>
}

export class DefaultSudoProfilesClient implements SudoProfilesClient {
  private static readonly Constants = {
    defaultSymmetricKeyId: 'symmetricKeyId',
    symmetricKeyEncryptionAlgorithm: 'AES/CBC/PKCS7Padding',
  }

  private readonly _apiClient: ApiClient
  private readonly _sudoUserClient: SudoUserClient
  private readonly _keyManager: SudoKeyManager
  private readonly _s3Client: S3Client
  private readonly _blobCache: typeof localForage
  private readonly _logger: Logger

  private readonly _onCreateSudoSubscriptionManager: SubscriptionManager<OnCreateSudoSubscription>
  private readonly _onUpdateSudoSubscriptionManager: SubscriptionManager<OnUpdateSudoSubscription>
  private readonly _onDeleteSudoSubscriptionManager: SubscriptionManager<OnDeleteSudoSubscription>

  constructor(options: SudoProfileOptions) {
    this._sudoUserClient = options.sudoUserClient

    if (options?.keyManager) {
      this._keyManager = options?.keyManager
    } else {
      const cryptoProvider = new WebSudoCryptoProvider(
        'SudoProfilesClient',
        'com.sudoplatform.appservicename',
      )
      this._keyManager = new DefaultSudoKeyManager(cryptoProvider)
    }
    this._logger =
      options.logger ?? new DefaultLogger('Sudo User Profiles', 'info')

    const identityServiceConfig =
      DefaultConfigurationManager.getInstance().bindConfigSet<IdentityServiceConfig>(
        IdentityServiceConfigCodec,
        'identityService',
      )

    if (
      !DefaultConfigurationManager.getInstance().getConfigSet('sudoService')
    ) {
      throw new SudoServiceConfigNotFoundError()
    }

    const sudoServiceConfig =
      DefaultConfigurationManager.getInstance().bindConfigSet<SudoServiceConfig>(
        SudoServiceConfigCodec,
        'sudoService',
      )

    if (options.apiClient) {
      this._apiClient = options.apiClient
    } else {
      const appSyncClient = DefaultApiClientManager.getInstance().getClient()

      this._apiClient = new ApiClient(appSyncClient, this._logger)
    }

    this._s3Client =
      options.s3Client ??
      new DefaultS3Client(
        this._sudoUserClient,
        identityServiceConfig,
        sudoServiceConfig,
        this._logger,
      )

    this._blobCache =
      options.blobCache ??
      localForage.createInstance({
        name: 'sudoProfilesBlobCache',
        driver: localForage.INDEXEDDB,
      })

    this._onCreateSudoSubscriptionManager = new SubscriptionManager()
    this._onUpdateSudoSubscriptionManager = new SubscriptionManager()
    this._onDeleteSudoSubscriptionManager = new SubscriptionManager()
  }

  public async createSudo(sudo: Sudo): Promise<Sudo> {
    this._logger.info('Creating a Sudo.')

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
    this._logger.info('Updating Sudo.')

    if (!sudo.id) {
      throw new IllegalArgumentError('Sudo ID was null')
    }

    const keyId = await this.getSymmetricKeyId()
    if (!keyId) {
      throw new IllegalStateError('Symmetric key missing.')
    }

    const secureClaims: Array<SecureClaimInput> = new Array<SecureClaimInput>()
    const secureS3Objects: Array<SecureS3ObjectInput> =
      new Array<SecureS3ObjectInput>()

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
              const encryptedData =
                await this._keyManager.encryptWithSymmetricKeyName(keyId, data)
              const key = await this._s3Client.upload(encryptedData, cacheId)

              const secureS3ObjectInput: SecureS3ObjectInput = {
                name: name,
                version: 1,
                algorithm:
                  DefaultSudoProfilesClient.Constants
                    .symmetricKeyEncryptionAlgorithm,
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

    this._logger.info(`Creating sudo with ${secureClaims.length} claims`)

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

    return sudo
  }

  public async getOwnershipProof(
    sudoId: string,
    audience: string,
  ): Promise<string> {
    this._logger.info('Calling getOwnerShipProof.')

    const ownershipProof = await this._apiClient.getOwnershipProof({
      sudoId,
      audience,
    })

    return ownershipProof.jwt
  }

  public async listSudos(fetchPolicy?: FetchOption): Promise<Sudo[]> {
    this._logger.info('Listing Sudos.')

    const sudos = await this._apiClient.listSudos(fetchPolicy)

    return sudos.length > 0
      ? await this.processListSudos(sudos, fetchPolicy, true)
      : []
  }

  public async reset(): Promise<void> {
    this._logger.info('Resetting client.')

    await this._apiClient.reset()
    await this._blobCache.clear()
  }

  public subscribeAll(id: string, subscriber: SudoSubscriber): Promise<void> {
    return Promise.all([
      this.subscribe(id, ChangeType.Create, subscriber),
      this.subscribe(id, ChangeType.Update, subscriber),
      this.subscribe(id, ChangeType.Delete, subscriber),
    ]).then(() => Promise.resolve())
  }

  public async subscribe(
    id: string,
    changeType: ChangeType,
    subscriber: SudoSubscriber,
  ): Promise<void> {
    this._logger.info('Subscribing for Sudo change notifications.')

    const owner = await this._sudoUserClient.getSubject()
    if (!owner) {
      throw new NotSignedInError()
    }

    switch (changeType) {
      case ChangeType.Create:
        this._onCreateSudoSubscriptionManager.replaceSubscriber(id, subscriber)
        // if subscription manager watcher and subscription hasn't been setup yet
        // create them and watch for sudo changes per `owner`
        if (!this._onCreateSudoSubscriptionManager.watcher) {
          this._onCreateSudoSubscriptionManager.watcher =
            this._apiClient.subscribeToOnCreateSudo(owner)

          this._onCreateSudoSubscriptionManager.subscription =
            this.executeCreateSudoSubscriptionWatcher()

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
          this._onUpdateSudoSubscriptionManager.watcher =
            this._apiClient.subscribeToOnUpdateSudo(owner)

          this._onUpdateSudoSubscriptionManager.subscription =
            this.executeUpdateSudoSubscriptionWatcher()

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
          this._onDeleteSudoSubscriptionManager.watcher =
            this._apiClient.subscribeToOnDeleteSudo(owner)

          this._onDeleteSudoSubscriptionManager.subscription =
            this.executeDeleteSudoSubscription()

          this._onDeleteSudoSubscriptionManager.connectionStatusChanged(
            ConnectionState.Connected,
          )
        }
        break
      default:
    }
  }

  public unsubscribe(id: string, changeType: ChangeType): void {
    this._logger.info('Unsubscribing from Sudo change notifications.')

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
    this._logger.info(
      'Unsubscribing all subscribers from Sudo change notifications.',
    )

    this._onCreateSudoSubscriptionManager.removeAllSubscribers()
    this._onUpdateSudoSubscriptionManager.removeAllSubscribers()
    this._onDeleteSudoSubscriptionManager.removeAllSubscribers()
  }

  public async pushSymmetricKey(keyId: string, key: string): Promise<void> {
    // Add new symmetric key to key store.
    await this._keyManager.addSymmetricKey(new TextEncoder().encode(key), keyId)
    // Set this key as the current default symmetric key to use.
    await this._keyManager.addSymmetricKey(
      new TextEncoder().encode(keyId),
      DefaultSudoProfilesClient.Constants.defaultSymmetricKeyId,
    )
  }

  private executeCreateSudoSubscriptionWatcher():
    | ZenObservable.Subscription
    | undefined {
    const subscription =
      this._onCreateSudoSubscriptionManager.watcher?.subscribe({
        complete: () => {
          this._logger.info('Completed onCreateSudo subscription')
          // Subscription was terminated. Notify the subscribers.
          this._onCreateSudoSubscriptionManager.connectionStatusChanged(
            ConnectionState.Disconnected,
          )
        },
        error: (error) => {
          this._logger.error('Failed to create a subscription', error)
          //Notify the subscribers.
          this._onCreateSudoSubscriptionManager.connectionStatusChanged(
            ConnectionState.Disconnected,
          )
        },

        next: async (
          result: SubscriptionResult<OnCreateSudoSubscription>,
        ): Promise<void> => {
          this._logger.info('executing onCreateSudo subscription', result)
          const data = result?.data?.onCreateSudo
          if (!data) {
            throw new FatalError(
              'onCreateSudo subscription response contained error',
            )
          } else {
            this._logger.info('onUpdateSudo subscription successful', data)
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
              this._logger.info(
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
              this._logger.info('No sudos found in cache')
            }
          }
          return Promise.resolve()
        },
      })

    return subscription
  }

  public async deleteSudo(sudo: Sudo): Promise<void> {
    this._logger.info('Deleting a Sudo.')

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
            await this._blobCache.removeItem(cacheId)
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
    const subscription =
      this._onUpdateSudoSubscriptionManager.watcher?.subscribe({
        complete: () => {
          this._logger.info('Completed onUpdateSudo subscription')
          // Subscription was terminated. Notify the subscribers.
          this._onUpdateSudoSubscriptionManager.connectionStatusChanged(
            ConnectionState.Disconnected,
          )
        },
        error: (error) => {
          this._logger.error('Failed to update a subscription', error)
          //Notify the subscribers.
          this._onUpdateSudoSubscriptionManager.connectionStatusChanged(
            ConnectionState.Disconnected,
          )
        },

        next: async (
          result: SubscriptionResult<OnUpdateSudoSubscription>,
        ): Promise<void> => {
          this._logger.info('executing onUpdateSudo subscription', result)
          const data = result?.data?.onUpdateSudo
          if (!data) {
            throw new FatalError(
              'onUpdateSudo subscription response contained error',
            )
          } else {
            this._logger.info('onUpdateSudo subscription successful', data)
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
              this._logger.info(
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
              this._logger.info('No sudos found in cache')
            }
          }

          return Promise.resolve()
        },
      })

    return subscription
  }

  private executeDeleteSudoSubscription():
    | ZenObservable.Subscription
    | undefined {
    const subscription =
      this._onDeleteSudoSubscriptionManager.watcher?.subscribe({
        complete: () => {
          this._logger.info('Completed onDeleteSudo subscription')
          // Subscription was terminated. Notify the subscribers.
          this._onDeleteSudoSubscriptionManager.connectionStatusChanged(
            ConnectionState.Disconnected,
          )
        },
        error: (error) => {
          this._logger.error('Failed to update a subscription', error)
          //Notify the subscribers.
          this._onDeleteSudoSubscriptionManager.connectionStatusChanged(
            ConnectionState.Disconnected,
          )
        },

        next: async (
          result: SubscriptionResult<OnDeleteSudoSubscription>,
        ): Promise<void> => {
          this._logger.info('executing onDeleteSudo subscription', result)
          const data = result?.data?.onDeleteSudo
          if (!data) {
            throw new FatalError(
              'onDeleteSudo subscription response contained error',
            )
          } else {
            this._logger.info('onDeleteSudo subscription successful', data)
            const items: GQLSudo[] = [data]
            const sudos = await this.processListSudos(
              items,
              FetchOption.CacheOnly,
              false,
            )
            if (sudos?.length > 0) {
              const sudo = sudos[0]
              const cachedItems = await this._apiClient.getCachedQueryItems()
              this._logger.info(
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
              this._logger.info('No sudos found in cache')
            }
          }
          return Promise.resolve()
        },
      })
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
    processS3Object = false,
  ): Promise<Sudo[]> {
    const sudos: Sudo[] = []

    this._logger.info(`Listing ${items.length} sudos`)
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
        this._logger.info(`Found S3objects to process: ${item.objects.length}`)
        for (const secureObject of item.objects) {
          // Check if we already have the S3 object in the cache. Return the cache entry
          // if asked to fetch from cache but otherwise download the S3 object.
          if (option === FetchOption.CacheOnly) {
            const cacheId = this.getObjectId(item.id, secureObject.name)
            if (!cacheId) {
              this._logger.info('Cannot determine the object ID from the key.')
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
            const decryptedData =
              await this._keyManager.decryptWithSymmetricKeyName(
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

  /**
   * Get default symmetric key Id
   */
  private async getSymmetricKeyId(): Promise<string | undefined> {
    const symmetricKeyBuffer = await this._keyManager.getSymmetricKey(
      DefaultSudoProfilesClient.Constants.defaultSymmetricKeyId,
    )
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(
        symmetricKeyBuffer,
      )
    } catch (err) {
      const error = err as Error
      throw new DecodeError(error.message)
    }
  }

  protected async createSecureString(
    name: string,
    value: string,
  ): Promise<SecureClaimInput> {
    const keyId = await this.getSymmetricKeyId()
    if (!keyId) {
      throw new FatalError('No symmetric key found.')
    }

    const byteArray = new TextEncoder().encode(value)
    const encryptedData = await this._keyManager.encryptWithSymmetricKeyName(
      keyId,
      byteArray,
    )

    const input: SecureClaimInput = {
      name: name,
      version: 1,
      algorithm:
        DefaultSudoProfilesClient.Constants.symmetricKeyEncryptionAlgorithm,
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
    const decryptedData = await this._keyManager.decryptWithSymmetricKeyName(
      keyId,
      Base64.decode(base64Data),
    )

    let decodedString = undefined
    try {
      decodedString = new TextDecoder('utf-8', { fatal: true }).decode(
        decryptedData,
      )
    } catch (err) {
      const error = err as Error
      throw new DecodeError(error.message)
    }

    return new Claim(
      name,
      ClaimVisibility.Private,
      new StringClaimValue(decodedString),
    )
  }
}
