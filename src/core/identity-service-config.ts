import * as t from 'io-ts'

export const IdentityServiceConfigCodec = t.intersection([
  t.type({
    region: t.string,
    poolId: t.string,
    clientId: t.string,
    identityPoolId: t.string,
    apiUrl: t.string,
    apiKey: t.string,
    transientBucket: t.string,
    registrationMethods: t.array(t.string),
  }),
  t.partial({
    bucket: t.string,
  }),
])

export type IdentityServiceConfig = t.TypeOf<typeof IdentityServiceConfigCodec>
