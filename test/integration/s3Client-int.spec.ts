import { DefaultSudoUserClient } from '@sudoplatform/sudo-user'
import { DefaultConfigurationManager } from '@sudoplatform/sudo-common'
import { TESTAuthenticationProvider } from '@sudoplatform/sudo-user/lib/user/auth-provider'
import privateKeyParam from '../../config/register_key.json'
import { DefaultS3Client } from '../../src/core/s3Client'
import FS from 'fs'
import * as path from 'path'
import * as uuid from 'uuid'
import { S3DownloadError } from '../../src/global/error'
import config from '../../config/sudoplatformconfig.json'
import { signIn, signOut, delay, } from './test-helper'

const globalAny: any = global
globalAny.WebSocket = require('ws')
require('isomorphic-fetch')

DefaultConfigurationManager.getInstance().setConfig(JSON.stringify(config))
const userClient = new DefaultSudoUserClient()

const s3Client = new DefaultS3Client(
  userClient, config.identityService
)

beforeEach(async (): Promise<void> => {
  await signIn(userClient)
}, 20000)

afterEach(async (): Promise<void> => {
  await signOut(userClient)
}, 10000)


describe('s3ClientIntegrationTests', () => {
  // Run e2e test
  describe('upload()', () => {
    it.skip('should upload file to s3 bucket', async () => {

      const fileData = FS.readFileSync(path.resolve(__dirname, './jordan.png'))

      const response = await s3Client.upload(fileData, `integration-test-${uuid.v4()}`)

      expect(response).toBeTruthy()

      // Deregister
      await userClient.deregister()
      expect(await userClient.isRegistered()).toBeFalsy()
    }, 30000)
  })

  // Run e2e test
  describe.skip('download()', () => {
    it('should download existing key', async () => {

      // Register
      const privateKeyJson = JSON.parse(JSON.stringify(privateKeyParam))
      const params: [1] = privateKeyJson['Parameters']
      const param = JSON.parse(JSON.stringify(params[0]))
      const privateKey = param.Value

      const testAuthenticationProvider = new TESTAuthenticationProvider(
        'SudoUser',
        privateKey,
      )

      await userClient.registerWithAuthenticationProvider(
        testAuthenticationProvider,
        'dummy_rid',
      )
      expect(await userClient.isRegistered()).toBeTruthy()

      // Sign in using private key
      const authTokens = await userClient.signInWithKey()
      expect(authTokens).toBeDefined()
      expect(authTokens.idToken).toBeDefined()
      expect(await userClient.isSignedIn()).toBeTruthy()

      // Upload file
      const fileData = FS.readFileSync(path.resolve(__dirname, './jordan.png'))
      const uploadResponse = await s3Client.upload(fileData, `integration-test-${uuid.v4()}`)
      expect(uploadResponse).toBeTruthy()

      // Download file
      const downloadResponse = await s3Client.download(uploadResponse)
      expect(downloadResponse).toBeTruthy()

      FS.writeFileSync(path.resolve(__dirname, './jordan-downloaded.png'), new Uint8Array(downloadResponse))

    }, 60000)
  })

  // Run e2e test
  describe('delete', () => {
    it.skip('should delete an existing file from S3', async () => {

      // Upload file
      const objectId = `integration-test-${uuid.v4()}`
      const fileData = FS.readFileSync(path.resolve(__dirname, './jordan.png'))
      const key = await s3Client.upload(fileData, objectId)
      expect(key).toBeTruthy()

      // Delete file
      await s3Client.delete(objectId)

      //Try to get file
      try {
        await s3Client.download(key)
        fail('File has not been deleted')
      } catch (error) {
        expect(error).toBeInstanceOf(S3DownloadError)
      }
    
    }, 60000)
  })

  describe('e2e test', () => {
    it('should upload, download, delete and cleanup', async () => {

      // Upload file
      const objectId = `integration-test-${uuid.v4()}`
      const fileData = FS.readFileSync(path.resolve(__dirname, './jordan.png'))
      const key = await s3Client.upload(fileData, objectId)
      expect(key).toBeTruthy()

      // Download file
      const downloadResponse = await s3Client.download(key)
      expect(downloadResponse).toBeTruthy()
      expect(downloadResponse.byteLength).toBeGreaterThanOrEqual(1800)

      // Delete file from S3
      await s3Client.delete(objectId)

      //Try to get file from S3
      console.log('confirm file has been deleted from s3')
      await delay(5000) 

      await expect(s3Client.download(key)).rejects.toThrow(S3DownloadError)

    }, 120000)
  })
})