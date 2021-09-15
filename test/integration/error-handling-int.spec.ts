import {
  DefaultConfigurationManager,
  DefaultLogger,
} from '@sudoplatform/sudo-common'
import { DefaultSudoUserClient } from '@sudoplatform/sudo-user'
import { mock } from 'ts-mockito'
import { Sudo } from '../../src/sudo/sudo'
import { DefaultSudoProfilesClient } from '../../src/sudo/sudo-profiles-client'
import { deregister, registerAndSignIn } from './test-helper'
import { ApolloLink, Observable } from 'apollo-link'
import { AuthLink } from 'aws-appsync-auth-link'
import { createSubscriptionHandshakeLink } from 'aws-appsync-subscription-link'
import AWSAppSyncClient, { AUTH_TYPE } from 'aws-appsync'
import { NotAuthorizedError } from '@sudoplatform/sudo-common/lib/errors/error'
import { RequestFailedError } from '@sudoplatform/sudo-common/lib/errors/error'
import { ApiClient } from '../../src/client/apiClient'
import { TextDecoder, TextEncoder } from 'util'
import { SudoNotFoundError } from '../../src/global/error'
import FS from 'fs'

//const globalAny: any = global
global.WebSocket = require('ws')
global.crypto = require('isomorphic-webcrypto')
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder as typeof global.TextDecoder
require('isomorphic-fetch')

const config = JSON.parse(
  FS.readFileSync(`${__dirname}/../../config/sudoplatformconfig.json`).toString(
    'binary',
  ),
)

DefaultConfigurationManager.getInstance().setConfig(JSON.stringify(config))

const sudoUserClient = new DefaultSudoUserClient()

const blobCacheMock: LocalForage = mock()

const clientOptions = {
  url: 'https://beed3uxqqnc3pmfj3qgah2fiz4.appsync-api.us-east-1.amazonaws.com/graphql',
  region: '',
  auth: {
    type: AUTH_TYPE.AMAZON_COGNITO_USER_POOLS,
    jwtToken: async () => await sudoUserClient.getLatestAuthToken(),
  },
} as const

let networkError: any = {
  name: 'name',
  message: 'message',
}

const mockLink = new ApolloLink(() => {
  return new Observable((observer) => {
    observer.error(networkError)
  })
})

const authLink = new AuthLink(clientOptions)
const subscriptionLink = createSubscriptionHandshakeLink(
  clientOptions,
  mockLink,
)
const link = ApolloLink.from([authLink, subscriptionLink])

const appSyncClient = new AWSAppSyncClient(
  { ...clientOptions, disableOffline: true },
  { link },
)

const sudoProfilesClient = new DefaultSudoProfilesClient({
  sudoUserClient: sudoUserClient,
  blobCache: blobCacheMock,
  apiClient: new ApiClient(
    appSyncClient,
    new DefaultLogger('Sudo User Profiles', 'info'),
  ),
})

beforeEach(async (): Promise<void> => {
  try {
    await registerAndSignIn(sudoUserClient)
    // Setup symmetric key before each test as
    // with the `afterEach` function we are calling `signOut`
    // which deregisters the user and also resets the keyManager
    // and in turn deletes all keys in sudoKeyManager
    await sudoProfilesClient.pushSymmetricKey(
      '1234',
      '14A9B3C3540142A11E70ACBB1BD8969F',
    )
  } catch (error) {
    fail(error)
  }
}, 30000)

afterEach(async (): Promise<void> => {
  await deregister(sudoUserClient)
}, 25000)

describe('test error handling', () => {
  it('should fail with SudoNotFoundError', async () => {
    const newSudo = new Sudo()
    newSudo.title = 'dummy_title'
    newSudo.firstName = 'dummy_first_name'
    newSudo.lastName = 'dummy_last_name'
    newSudo.label = 'dummy_label'
    newSudo.notes = 'dummy_notes'
    newSudo.id = 'not-found'

    await expect(sudoProfilesClient.deleteSudo(newSudo)).rejects.toThrow(
      new SudoNotFoundError(),
    )
  })

  it('should fail with NotAuthorizedError', async () => {
    // Create new Sudo
    const newSudo = new Sudo()
    newSudo.title = 'dummy_title'
    newSudo.firstName = 'dummy_first_name'
    newSudo.lastName = 'dummy_last_name'
    newSudo.label = 'dummy_label'
    newSudo.notes = 'dummy_notes'

    networkError = {
      name: 'name',
      message: 'message',
      statusCode: 401,
    }

    await expect(sudoProfilesClient.createSudo(newSudo)).rejects.toThrow(
      new NotAuthorizedError(),
    )
  }, 30000)

  it('should fail with RequestFailedError', async () => {
    // Create new Sudo
    const newSudo = new Sudo()
    newSudo.title = 'dummy_title'
    newSudo.firstName = 'dummy_first_name'
    newSudo.lastName = 'dummy_last_name'
    newSudo.label = 'dummy_label'
    newSudo.notes = 'dummy_notes'

    networkError = {
      name: 'name',
      message: 'message',
    }

    try {
      await sudoProfilesClient.createSudo(newSudo)
    } catch (error) {
      expect(error).toBeInstanceOf(RequestFailedError)
    }
  }, 30000)

  it('should fail with RequestFailedError 500', async () => {
    // Create new Sudo
    const newSudo = new Sudo()
    newSudo.title = 'dummy_title'
    newSudo.firstName = 'dummy_first_name'
    newSudo.lastName = 'dummy_last_name'
    newSudo.label = 'dummy_label'
    newSudo.notes = 'dummy_notes'

    networkError = {
      name: 'name',
      message: 'message',
      statusCode: 500,
    }

    try {
      await sudoProfilesClient.createSudo(newSudo)
    } catch (error: any) {
      expect(error).toBeInstanceOf(RequestFailedError)
      expect(error.statusCode).toBe(500)
    }
  }, 30000)
})
