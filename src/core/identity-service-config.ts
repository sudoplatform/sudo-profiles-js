import * as t from 'io-ts'

export const IdentityServiceConfig = t.type({
  region: t.string,
  poolId: t.string,
  clientId: t.string,
  identityPoolId: t.string,
  apiUrl: t.string,
  apiKey: t.string,
  bucket: t.string,
  transientBucket: t.string,
  registrationMethods: t.array(t.string),
})

export type IdentityServiceConfig = t.TypeOf<typeof IdentityServiceConfig>
