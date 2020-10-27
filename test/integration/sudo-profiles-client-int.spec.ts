import { DefaultSudoUserClient } from '@sudoplatform/sudo-user'
import { DefaultConfigurationManager } from '@sudoplatform/sudo-common'
import { TESTAuthenticationProvider } from '@sudoplatform/sudo-user/lib/user/auth-provider'
import privateKeyParam from '../../config/register_key.json'
import { DefaultSudoProfilesClient } from '../../src/sudo/sudo-profiles-client'
import { DefaultKeyManager } from '../../src/core/key-manager'
import { KeyStore } from '../../src/core/key-store'
import { Sudo } from '../../src/sudo/sudo'
import config from '../../config/sudoplatformconfig.json'
import { DefaultApiClientManager } from '@sudoplatform/sudo-api-client'
import { PolicyFailedException } from '../../src/global/error'

const globalAny: any = global
globalAny.WebSocket = require('ws')
require('isomorphic-fetch')
global.crypto = require('isomorphic-webcrypto')


DefaultConfigurationManager.getInstance().setConfig(JSON.stringify(config))
const userClient = new DefaultSudoUserClient()
const apiClientManager = DefaultApiClientManager
  .getInstance()
  .setAuthClient(userClient)
const apiManager = apiClientManager.getClient({disableOffline: true})
const keyStore = new KeyStore()
const keyManager = new DefaultKeyManager(keyStore)
const textEncoder = new TextEncoder()
const symmetricKeyId = '1234'
const symmetricKey = '14A9B3C3540142A11E70ACBB1BD8969F'
keyManager.setSymmetricKeyId(symmetricKeyId)
keyManager.insertKey(symmetricKeyId, textEncoder.encode(symmetricKey))

const sudoProfilesClient = new DefaultSudoProfilesClient(
  userClient,
  keyManager,
  apiManager,
)

describe('sudoProfilesClient', () => {

  describe('redeem()', () => {
    it('should redeem entitlement', async () => {


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

      // Redeem Entitlement
      const entitlements = await sudoProfilesClient.redeem(
        'sudoplatform.sudo.max=1',
        'entitlements'
      )
      expect(entitlements).toBeTruthy()
      expect(entitlements.length).toBeGreaterThanOrEqual(1)
      expect(entitlements[0].name).toEqual('sudoplatform.sudo.max')
      expect(entitlements[0].value).toEqual(1)

      // Create new Sudo
      const newSudo = new Sudo()
      newSudo.title = 'dummy_title'
      newSudo.firstName = 'dummy_first_name'
      newSudo.lastName = 'dummy_last_name'
      newSudo.label = 'dummy_label'
      newSudo.notes = 'dummy_notes'

      const createdSudo = await sudoProfilesClient.createSudo(newSudo)

      expect(createdSudo.title).toEqual('dummy_title')
      expect(createdSudo.firstName).toEqual('dummy_first_name')
      expect(createdSudo.lastName).toEqual('dummy_last_name')
      expect(createdSudo.label).toEqual('dummy_label')
      expect(createdSudo.notes).toEqual('dummy_notes')

      
      const sudos = await sudoProfilesClient.listSudos()
      expect(sudos.length).toEqual(1)

      const sudo = sudos[0]
      expect(sudo.title).toEqual('dummy_title')
      expect(sudo.firstName).toEqual('dummy_first_name')
      expect(sudo.lastName).toEqual('dummy_last_name')
      expect(sudo.label).toEqual('dummy_label')
      expect(sudo.notes).toEqual('dummy_notes')

      //Try and create another sudo
      const anotherSudo = new Sudo()
      anotherSudo.title = 'dummy2_title'
      anotherSudo.firstName = 'dummy2_first_name'
      anotherSudo.lastName = 'dummy2_last_name'
      anotherSudo.label = 'dummy2_label'
      anotherSudo.notes = 'dummy2_notes'

      try {
        await sudoProfilesClient.createSudo(anotherSudo)
        fail('Creating more sudos was expected to fail.')
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyFailedException)
      }
      
      // Deregister
      await userClient.deregister()
      expect(await userClient.isRegistered()).toBeFalsy()

    }, 60000)
  })

})