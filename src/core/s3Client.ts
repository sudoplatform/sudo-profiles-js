import { SudoUserClient } from '@sudoplatform/sudo-user'
import { CognitoIdentityCredentials } from 'aws-sdk'
import S3, { ManagedUpload } from 'aws-sdk/clients/s3'
import { DeleteError, DownloadError, UploadError } from '../global/error'
import { IdentityServiceConfig } from './identity-service-config'

/**
 * S3 client wrapper protocol mainly used for providing an abstraction layer on top of
 * AWS S3 SDK.
 */
export interface S3Client {
  readonly bucket: string

  readonly region: string

  /**
   * Uploads a blob to AWS S3.
   *
   * @param data blob as [ByteArray].
   * @param objectId Unique ID for the blob.
   *
   * @return AWS S3 key representing the location of the blob.
   *
   * @throws {@link UploadError}
   */
  upload(data: ArrayBuffer, objectId: string): Promise<string>

  /**
   * Get events raised as part of httpUploadProgress
   */
  getHttpUploadProgress(): ManagedUpload.Progress[]

  /**
   * Downloads a blob from AWS S3.
   *
   * @param key AWS S3 key representing the location of the blob.
   *
   * @returns ArrayBuffer
   *
   * @throws {@link DownloadError}
   */
  download(key: string): Promise<ArrayBuffer>

  /**
   * Deletes a blob from AWS S3.
   *
   * @param objectId AWS S3 key representing the location of the blob.
   *
   * @throws {@link DeleteError}
   */
  delete(objectId: string): Promise<void>
}

export class DefaultS3Client implements S3Client {
  private _progressEvents: ManagedUpload.Progress[] = []

  private readonly _region: string
  private readonly _bucket: string
  private readonly _identityPoolId: string
  private readonly _sudoUserClient: SudoUserClient
  private readonly _providerName: string

  constructor(
    sudoUserClient: SudoUserClient,
    identityServiceConfig: IdentityServiceConfig,
  ) {
    this._region = identityServiceConfig.region
    this._bucket = identityServiceConfig.bucket
    this._identityPoolId = identityServiceConfig.identityPoolId
    this._providerName = `cognito-idp.${this._region}.amazonaws.com/${identityServiceConfig.poolId}`

    this._sudoUserClient = sudoUserClient
  }

  public get bucket(): string {
    return this._bucket
  }

  public get region(): string {
    return this._region
  }

  public getHttpUploadProgress(): ManagedUpload.Progress[] {
    return this._progressEvents
  }

  private async getInitData(): Promise<[S3, CognitoIdentityCredentials]> {
    const authTokens = await this._sudoUserClient.getLatestAuthToken()

    const credentialsProvider = new CognitoIdentityCredentials(
      {
        IdentityPoolId: this._identityPoolId,
        Logins: {
          [this._providerName]: authTokens,
        },
      },
      {
        region: 'us-east-1',
      },
    )

    await credentialsProvider.getPromise()

    return [
      new S3({
        region: this._region,
        credentials: credentialsProvider,
        params: {
          bucket: this._bucket,
        },
      }),
      credentialsProvider,
    ]
  }

  public async upload(data: ArrayBuffer, objectId: string): Promise<string> {
    console.log('Uploading a blob to S3.')

    const initData = await this.getInitData()
    const s3Client = initData[0]
    const credentialProvider = initData[1]

    const identityId = credentialProvider.identityId
    const key = `${identityId}/${objectId}`
    console.log(`Uploading to - bucket: ${this._bucket}, blob key: ${key}`)

    const managedUpload = new S3.ManagedUpload(<
      S3.ManagedUpload.ManagedUploadOptions
    >{
      service: s3Client,
      params: {
        Bucket: this._bucket,
        Key: key,
        Body: data,
      },
    })

    managedUpload.on('httpUploadProgress', (progress) => {
      console.log(progress)
      this._progressEvents.push(progress)
    })

    try {
      const response = await managedUpload.promise()
      console.log('Upload response: ', response)
      return response.Key
    } catch (error) {
      throw new UploadError(error.message)
    }
  }

  public async download(key: string): Promise<ArrayBuffer> {
    console.log('Downloading a blob from S3.')

    const initData = await this.getInitData()
    const s3Client = initData[0]

    try {
      const params = {
        Bucket: this._bucket,
        Key: key,
      }
      const response = await s3Client.getObject(params).promise()
      if (!response.Body) {
        throw new DownloadError('Did not find file to download.')
      }

      if (typeof response.Body === 'string') {
        return new TextEncoder().encode(response.Body)
      } else if (response.Body instanceof Buffer) {
        return response.Body
      } else if (response.Body instanceof Uint8Array) {
        return (response.Body as Uint8Array).buffer
      } else {
        throw new DownloadError('Object type is not supported in browser.')
      }
    } catch (error) {
      throw new DownloadError(error.message)
    }
  }

  public async delete(objectId: string): Promise<void> {
    console.log('Deleting a blob from S3.')

    const initData = await this.getInitData()
    const s3Client = initData[0]
    const credentialsProvider = initData[1]

    try {
      const key = `${credentialsProvider.identityId}/${objectId}`
      const params = {
        Bucket: this._bucket,
        Key: key,
      }
      console.log('Deleting: ', key)
      const response = await s3Client.deleteObject(params).promise()
      console.log(response)
    } catch (error) {
      throw new DeleteError(error.message)
    }
  }
}
