import { DefaultSudoUserClient } from '@sudoplatform/sudo-user'
import { TESTAuthenticationProvider } from '@sudoplatform/sudo-user/lib/user/auth-provider'
import privateKeyParam from '../../config/register_key.json'


export async function signIn(userClient: DefaultSudoUserClient): Promise<void> {
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
  await expect(userClient.isRegistered()).resolves.toBeTruthy()

  // Sign in using private key
  const authTokens = await userClient.signInWithKey()
  expect(authTokens).toBeDefined()
  expect(authTokens.idToken).toBeDefined()
  await expect(userClient.isSignedIn()).resolves.toBeTruthy()
}

export async function signOut(userClient: DefaultSudoUserClient): Promise<void> {
  // Deregister
  await userClient.deregister()
  await expect(userClient.isRegistered()).resolves.toBeFalsy()
}

export function delay(ms: number) {
  console.log(`Waiting ${ms} milleseconds...`)
  return new Promise((resolve) => setTimeout(resolve, ms))
}