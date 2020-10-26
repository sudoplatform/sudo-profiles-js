import S3 from 'aws-sdk/clients/s3'

/**
 * S3 client wrapper protocol mainly used for providing an abstraction layer on top of
 * AWS S3 SDK.
 */
export interface S3Client {
  /**
   * Uploads a blob to AWS S3.
   *
   * @param data blob as [ByteArray].
   * @param objectId Unique ID for the blob.
   * @return AWS S3 key representing the location of the blob.
   */
  upload(data: ArrayBuffer, objectId: string): Promise<string>

  /**
   * Downloads a blob from AWS S3.
   *
   * @param key AWS S3 key representing the location of the blob.
   */
  download(key: string): Promise<ArrayBuffer>

  /**
   * Deletes a blob from AWS S3.
   *
   * @param objectId AWS S3 key representing the location of the blob.
   */
  delete(objectId: string): Promise<void>
}

export class DefaultS3Client implements S3Client {
  private readonly _region: string
  private readonly _bucket: string
  private readonly _amazonS3Client: S3

  constructor(region: string, bucket: string) {
    this._region = region
    this._bucket = bucket

    this._amazonS3Client = new S3({
      region: this._region,
    })
  }

  async upload(data: ArrayBuffer, objectId: string): Promise<string> {
    console.log('Uploading a blob to S3.')

    console.log(data)
    console.log(objectId)

    //TODO: Implement CognitoCredentialsProvider to use identityPoolId
    //to allow permission to upload to S3 bucket
    // Currently on Sudo User Client in Android...might have to move to sudo profiles

    throw new Error('Method not implemented.')
  }
  async download(key: string): Promise<ArrayBuffer> {
    console.log(key)
    throw new Error('Method not implemented.')
  }
  async delete(objectId: string): Promise<void> {
    console.log(objectId)
    throw new Error('Method not implemented.')
  }
}
