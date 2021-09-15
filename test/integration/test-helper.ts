import { DefaultSudoUserClient } from '@sudoplatform/sudo-user'
import { TESTAuthenticationProvider } from '@sudoplatform/sudo-user/lib/user/auth-provider'
import * as fs from 'fs'
export async function registerAndSignIn(
  userClient: DefaultSudoUserClient,
): Promise<void> {
  // Register
  const privateKey = fs
    .readFileSync(`${__dirname}/../../config/register_key.private`)
    .toString('utf-8')
    .trim()
  const keyId = fs
    .readFileSync(`${__dirname}/../../config/register_key.id`)
    .toString('utf-8')
    .trim()

  const testAuthenticationProvider = new TESTAuthenticationProvider(
    'SudoUser',
    privateKey,
    keyId,
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

export async function deregister(
  userClient: DefaultSudoUserClient,
): Promise<void> {
  // Deregister
  await userClient.deregister()
  await expect(userClient.isRegistered()).resolves.toBeFalsy()
}

export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
