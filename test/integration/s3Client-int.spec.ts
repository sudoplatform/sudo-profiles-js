import {
  DefaultConfigurationManager,
  DefaultLogger,
} from '@sudoplatform/sudo-common'
import { DefaultSudoUserClient } from '@sudoplatform/sudo-user'
import { DefaultSudoEntitlementsClient } from '@sudoplatform/sudo-entitlements'
import FS from 'fs'
import * as path from 'path'
import * as uuid from 'uuid'
import config from '../../config/sudoplatformconfig.json'
import { DefaultS3Client } from '../../src/core/s3Client'
import { S3DownloadError } from '../../src/global/error'
import { delay, deregister, registerAndSignIn } from './test-helper'
import { DefaultApiClientManager } from '@sudoplatform/sudo-api-client'
import { TextDecoder, TextEncoder } from 'util'

const globalAny: any = global
globalAny.WebSocket = require('ws')
require('isomorphic-fetch')
globalAny.crypto = require('isomorphic-webcrypto')

global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

DefaultConfigurationManager.getInstance().setConfig(JSON.stringify(config))

const userClient = new DefaultSudoUserClient()

DefaultApiClientManager.getInstance().setAuthClient(userClient)

const entitlementsClient = new DefaultSudoEntitlementsClient(userClient)
const logger = new DefaultLogger('s3Client tests')

const s3Client = new DefaultS3Client(
  userClient,
  config.identityService,
  config.sudoService,
  logger,
)

beforeEach(async (): Promise<void> => {
  await registerAndSignIn(userClient)
  await entitlementsClient.redeemEntitlements()
}, 20000)

afterEach(async (): Promise<void> => {
  await deregister(userClient)
}, 10000)

describe('s3ClientIntegrationTests', () => {
  // Run e2e test
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
      await delay(5000)

      await expect(s3Client.download(key)).rejects.toThrow(S3DownloadError)
    }, 120000)
  })
})
