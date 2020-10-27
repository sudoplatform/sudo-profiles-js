import {
  ApiClientConfig,
  DefaultApiClientManager,
} from '@sudoplatform/sudo-api-client'
import { DefaultConfigurationManager } from '@sudoplatform/sudo-common'
import { SudoUserClient } from '@sudoplatform/sudo-user'
import { InMemoryCache, NormalizedCacheObject } from 'apollo-cache-inmemory'
import { AWSAppSyncClient } from 'aws-appsync'
import { KeyManager } from '../core/key-manager'
import { DefaultQueryCache, QueryCache } from '../core/query-cache'
import { DefaultS3Client, S3Client } from '../core/s3Client'
import {
  CreateSudoDocument,
  CreateSudoInput,
  CreateSudoMutation,
  CreateSudoMutationVariables,
  GetOwnershipProofDocument,
  GetOwnershipProofInput,
  GetOwnershipProofMutation,
  GetOwnershipProofMutationVariables,
  ListSudosDocument,
  ListSudosQuery,
  RedeemTokenDocument,
  RedeemTokenInput,
  RedeemTokenMutation,
  RedeemTokenMutationVariables,
  SecureClaimInput,
  SecureS3ObjectInput,
  Sudo as GQLSudo,
  UpdateSudoDocument,
  UpdateSudoInput,
  UpdateSudoMutation,
  UpdateSudoMutationVariables,
} from '../gen/graphql-types'
import {
  FatalError,
  IllegalArgumentException,
  toPlatformExceptionOrThrow,
} from '../global/error'
import { AesSecurityProvider } from '../security/aesSecurityProvider'
import {
  SecurityProvider,
  SymmetricKeyEncryptionAlgorithm,
} from '../security/securityProvider'
import { Base64 } from '../utils/base64'
import { Entitlement } from './entitlement'
import {
  BlobClaimValue,
  Claim,
  FetchOption,
  StringClaimValue,
  Sudo,
} from './sudo'

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
   * @Throws {@link FatalError}
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
   * @Throws {@link IllegalArgumentException}
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
   *  @Throws {@link FatalError}
   */
  getOwnershipProof(sudoId: string, audience: string): Promise<string>

  /**
   * Redeem a token to be granted additional entitlements.
   *
   * @param token Token.
   * @param type Token type. Currently only valid value is "entitlements" but this maybe extended in future.
   *
   * @return List<Entitlement>: A list of entitlements
   */
  redeem(token: string, type: string): Promise<Entitlement[]>

  /**
   * Retrieves all Sudos owned by the signed in user.
   *
   * @param fetchPolicy: option for controlling the behaviour of this API. Refer to `FetchOption` enum.
   *
   * @return Sudo[]: An array of Sudos
   *
   * @Throws {@link FatalError}
   */
  listSudos(fetchPolicy?: FetchOption): Promise<Sudo[]>
}

export class DefaultSudoProfilesClient implements SudoProfilesClient {
  private readonly _apiClient: AWSAppSyncClient<NormalizedCacheObject>
  private readonly _sudoUserClient: SudoUserClient
  private readonly _config: ApiClientConfig
  private readonly _keyManager: KeyManager
  private readonly _s3Client: S3Client
  private readonly _queryCache: QueryCache
  private readonly _securityProvider: SecurityProvider

  constructor(
    sudoUserClient: SudoUserClient,
    keyManager: KeyManager,
    apiClient?: AWSAppSyncClient<NormalizedCacheObject>,
    config?: ApiClientConfig,
    s3Client?: S3Client,
    queryCache?: QueryCache,
    securityProvider?: SecurityProvider,
  ) {
    this._sudoUserClient = sudoUserClient
    this._keyManager = keyManager

    this._config =
      config ??
      DefaultConfigurationManager.getInstance().bindConfigSet<ApiClientConfig>(
        ApiClientConfig,
        'apiService',
      )

    if (!apiClient) {
      const defaultApiClientManager = DefaultApiClientManager.getInstance()
        .setConfig(this._config)
        .setAuthClient(this._sudoUserClient)
        .getClient()

      defaultApiClientManager.cache = new InMemoryCache()
      this._apiClient = defaultApiClientManager
    } else {
      this._apiClient = apiClient
    }

    //TODO: Setup S3Client if not passed in
    this._s3Client =
      s3Client ?? new DefaultS3Client('some-region', 'some-bucket')

    this._queryCache = queryCache ?? new DefaultQueryCache(this._apiClient)

    this._securityProvider =
      securityProvider ?? new AesSecurityProvider(this._keyManager)
  }

  public async createSudo(sudo: Sudo): Promise<Sudo> {
    console.log('Creating a Sudo.')

    const keyId = await this.getSymmetricKeyId()
    if (!keyId) {
      throw new IllegalArgumentException('Symmetric key missing.')
    }

    try {
      const input: CreateSudoInput = {
        claims: [],
        objects: [],
      }

      const variables: CreateSudoMutationVariables = {
        input,
      }

      const response = await this._apiClient.mutate<CreateSudoMutation>({
        mutation: CreateSudoDocument,
        variables,
      })

      const result = response.data?.createSudo
      if (!result) {
        throw new FatalError('Unexpected. No result data.')
      } else {
        sudo.id = result.id
        sudo.version = result.version
        sudo.createdAt = new Date(result.createdAtEpochMs)
        sudo.updatedAt = new Date(result.updatedAtEpochMs)

        return this.updateSudo(sudo)
      }
    } catch (error) {
      throw toPlatformExceptionOrThrow(error)
    }
  }

  public async updateSudo(sudo: Sudo): Promise<Sudo> {
    console.log('Updating Sudo.')

    if (!sudo.id) {
      throw new IllegalArgumentException('Sudo ID was null')
    }

    const keyId = await this.getSymmetricKeyId()
    if (!keyId) {
      throw new IllegalArgumentException('Symmetric key missing.')
    }

    try {
      const secureClaims: Array<SecureClaimInput> = new Array<
        SecureClaimInput
      >()
      const secureS3Objects: Array<SecureS3ObjectInput> = new Array<
        SecureS3ObjectInput
      >()

      for (const [name, claim] of sudo.claims) {
        if (claim.visibility === ClaimVisibility.Private) {
          if (claim.value instanceof BlobClaimValue) {
            if (claim.value.file) {
              //TODO: store file in cache?

              // Cache API
              // is experimental and expected to change in the future
              // Data doesn't expire in cache unless you delete it

              // Web Storage (localstorage)
              // is for name / value pairs and not good for large amounts of data (images)

              // IndexedDB API
              // Complex but a good candidate

              try {
                const data = await this.loadFileAsArray(claim.value.file)
                if (!data) {
                  console.log(
                    'Could not load file for claim name: ' + claim.name,
                  )
                  continue
                }

                // const newClaim = new Claim(
                //   name,
                //   claim.visibility,
                //   new BlobClaimValue(''),
                // )
                // sudo.claims.set(name, newClaim)

                // const securityProvider = new AesSecurityProvider(this._keyStore)
                // const encryptedData = await securityProvider.encrypt(keyId, data)

                //TODO: upload to S3 bucket
              } catch (error) {
                //TODO: Remove blob from cache
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

      const input: UpdateSudoInput = {
        id: sudo.id,
        expectedVersion: sudo.version,
        claims: secureClaims,
        objects: secureS3Objects,
      }

      const variables: UpdateSudoMutationVariables = {
        input,
      }

      const response = await this._apiClient.mutate<UpdateSudoMutation>({
        mutation: UpdateSudoDocument,
        variables,
      })

      const result = response.data?.updateSudo
      if (!result) {
        throw new FatalError('Mutation succeeded but output was null.')
      } else {
        sudo.id = result.id
        sudo.version = result.version
        sudo.createdAt = new Date(result.createdAtEpochMs)
        sudo.updatedAt = new Date(result.updatedAtEpochMs)

        await this._queryCache.add(result)

        return sudo
      }
    } catch (error) {
      throw toPlatformExceptionOrThrow(error)
    }
  }

  public async getOwnershipProof(
    sudoId: string,
    audience: string,
  ): Promise<string> {
    console.log('Calling getOwnerShipProof.')

    try {
      const input: GetOwnershipProofInput = {
        sudoId,
        audience,
      }

      const variables: GetOwnershipProofMutationVariables = {
        input,
      }

      const response = await this._apiClient.mutate<GetOwnershipProofMutation>({
        mutation: GetOwnershipProofDocument,
        variables,
      })

      const result = response.data?.getOwnershipProof
      if (!result) {
        throw new FatalError('Unexpected: no result data.')
      } else {
        return result.jwt
      }
    } catch (error) {
      throw toPlatformExceptionOrThrow(error)
    }
  }

  public async redeem(token: string, type: string): Promise<Entitlement[]> {
    console.log('Redeeming a token')

    try {
      const input: RedeemTokenInput = {
        token,
        type,
      }

      const variables: RedeemTokenMutationVariables = {
        input,
      }

      const response = await this._apiClient.mutate<RedeemTokenMutation>({
        mutation: RedeemTokenDocument,
        variables,
      })

      const result = response.data?.redeemToken
      if (!result) {
        throw new FatalError('Mutation succeeded but output was null.')
      } else {
        return result.map((redeemToken) => {
          return new Entitlement(redeemToken.name, redeemToken.value)
        })
      }
    } catch (error) {
      throw toPlatformExceptionOrThrow(error)
    }
  }

  public async listSudos(fetchPolicy?: FetchOption): Promise<Sudo[]> {
    console.log('Listing Sudos.')

    try {
      const response = await this._apiClient.query<ListSudosQuery>({
        query: ListSudosDocument,
        fetchPolicy: fetchPolicy,
      })

      let sudos: Sudo[] = []
      const items = response.data?.listSudos?.items
      if (items) {
        sudos = await this.processListSudos(items, fetchPolicy)
      } else {
        throw new FatalError('Mutation succeeded but output was null.')
      }

      return sudos
    } catch (error) {
      throw toPlatformExceptionOrThrow(error)
    }
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

      //TODO: Finish processing S3Object
      if (processS3Object) {
        if (option === FetchOption.CacheOnly) {
        } else {
        }
      }

      sudos.push(sudo)
    }

    return sudos
  }

  private async getSymmetricKeyId(): Promise<string | undefined> {
    return await this._keyManager.getSymmetricKeyId()
  }

  private loadFileAsArray(file: File): Promise<ArrayBuffer | undefined> {
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
