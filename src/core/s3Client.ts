/*
 * Copyright © 2023 Anonyome Labs, Inc. All rights reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from '@sudoplatform/sudo-common'
import { SudoUserClient } from '@sudoplatform/sudo-user'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client as AWSS3Client,
} from '@aws-sdk/client-s3'

import {
  InvalidConfigError,
  S3DeleteError,
  S3DownloadError,
  S3UploadError,
} from '../global/error'
import { IdentityServiceConfig } from './identity-service-config'
import { SudoServiceConfig } from './sudo-service-config'
import { Progress, Upload } from '@aws-sdk/lib-storage'
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers'
import { CognitoIdentityCredentials } from '@aws-sdk/credential-provider-cognito-identity'

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
  getHttpUploadProgress(): Progress[]

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
  private _progressEvents: Progress[] = []

  private readonly _region: string
  private readonly _bucket: string
  private readonly _identityPoolId: string
  private readonly _sudoUserClient: SudoUserClient
  private readonly _providerName: string
  private readonly _logger: Logger

  constructor(
    sudoUserClient: SudoUserClient,
    identityServiceConfig: IdentityServiceConfig,
    sudoServiceConfig: SudoServiceConfig,
    logger: Logger,
  ) {
    const region = sudoServiceConfig.region ?? identityServiceConfig.region
    const bucket = sudoServiceConfig.bucket ?? identityServiceConfig.bucket
    if (!(region && bucket)) {
      throw new InvalidConfigError('Bucket or region missing.')
    }
    this._region = region
    this._bucket = bucket
    this._identityPoolId = identityServiceConfig.identityPoolId
    this._providerName = `cognito-idp.${this._region}.amazonaws.com/${identityServiceConfig.poolId}`

    this._sudoUserClient = sudoUserClient
    this._logger = logger
  }

  public get bucket(): string {
    return this._bucket
  }

  public get region(): string {
    return this._region
  }

  public getHttpUploadProgress(): Progress[] {
    return this._progressEvents
  }

  private async getInitData(): Promise<
    [AWSS3Client, CognitoIdentityCredentials]
  > {
    const authTokens = await this._sudoUserClient.getLatestAuthToken()

    const credentialsProvider = fromCognitoIdentityPool({
      identityPoolId: this._identityPoolId,
      logins: {
        [this._providerName]: authTokens,
      },
      clientConfig: { region: this._region },
    })

    const credentials = await credentialsProvider()

    return [
      new AWSS3Client({
        region: this._region,
        credentials: credentialsProvider,
      }),
      credentials,
    ]
  }

  public async upload(data: ArrayBuffer, objectId: string): Promise<string> {
    this._logger.info('Uploading a blob to S3.')

    const initData = await this.getInitData()
    const s3Client = initData[0]
    const credentialProvider = initData[1]

    const identityId = credentialProvider.identityId
    const key = `${identityId}/${objectId}`
    this._logger.info(
      `Uploading to - bucket: ${this._bucket}, blob key: ${key}`,
    )

    const bufferData = Buffer.from(data)

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: this._bucket,
        Key: key,
        Body: bufferData,
      },
    })

    upload.on('httpUploadProgress', (progress) => {
      this._logger.info('httpUploadProgress', { progress })
      this._progressEvents.push(progress)
    })

    try {
      const response = await upload.done()
      this._logger.info('Upload response: ', { response })
      return key
    } catch (err) {
      const error = err as Error
      const msg = `${error.name}: ${error.message}`
      this._logger.error(msg)
      throw new S3UploadError(msg)
    }
  }

  public async download(key: string): Promise<ArrayBuffer> {
    this._logger.info('Downloading a blob from S3.')

    const initData = await this.getInitData()
    const s3Client = initData[0]

    try {
      const params = {
        Bucket: this._bucket,
        Key: key,
      }
      const getObjectCommand = new GetObjectCommand(params)
      const response = await s3Client.send(getObjectCommand)
      if (!response.Body) {
        throw new S3DownloadError('Did not find file to download.')
      }

      return response.Body.transformToByteArray()
    } catch (err) {
      const error = err as Error
      const msg = `${error.name}: ${error.message}`
      this._logger.error(msg)
      throw new S3DownloadError(msg)
    }
  }

  public async delete(objectId: string): Promise<void> {
    this._logger.info('Deleting a blob from S3.')

    const initData = await this.getInitData()
    const s3Client = initData[0]
    const credentials = initData[1]

    try {
      const key = `${credentials.identityId}/${objectId}`
      const params = {
        Bucket: this._bucket,
        Key: key,
      }
      this._logger.info('Deleting: ', { key })
      const deleteObjectCommand = new DeleteObjectCommand(params)
      await s3Client.send(deleteObjectCommand)
    } catch (err) {
      const error = err as Error
      const msg = `${error.name}: ${error.message}`
      this._logger.error(msg)
      throw new S3DeleteError(msg)
    }
  }
}
