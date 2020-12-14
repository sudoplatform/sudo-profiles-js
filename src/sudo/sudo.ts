import { ClaimVisibility } from './sudo-profiles-client'

export enum FetchOption {
  /**
   * Returns Sudos from the local cache only.
   */
  CacheOnly = 'cache-only',
  /**
   * Fetches Sudos from the backend and ignores any cached entries.
   */
  RemoteOnly = 'network-only',

  /**
   * Executes the full query against both the cache and your GraphQL server. The *query automatically updates if the result of the server-side * query modifies cached fields.
   * Provides a fast response while also helping to keep cached data consistent  with server data.
   */
  CacheAndRemote = 'cache-and-network',

  /**
   * Similar to RemoteOnly except the query's result is not stored in the cache
   */
  NoCache = 'no-cache',

  /**
   * Executes the query against the cache. If all requested data is present in the cache, that data is returned. Otherwise, Apollo Client executes the query against your GraphQL server and returns that data after caching it.

   * Prioritizes minimizing the number of network requests sent by your application.
   * This is the default policy
   */
  CacheFirst = 'cache-first',
}

export enum ErrorOption {
  All = 'all',
}

/**
 * String value.
 */
export class StringClaimValue {
  public value: string | undefined = undefined
  constructor(val: string) {
    this.value = val
  }
}

/**
 * Blob value represented as a URI.
 * Typically a file location of the blob
 * or a file to upload.
 */
export class BlobClaimValue {
  public value: string | undefined = undefined
  public file: ArrayBuffer | undefined = undefined
  constructor(val?: string, file?: ArrayBuffer) {
    this.value = val
    this.file = file
  }
}

/**
 * Represents a claim or identity attribute associated with a Sudo.
 * @param name Claim name.
 * @param visibility Claim visibility.
 * @param value Claim value.
 */
export class Claim {
  name: string
  visibility: ClaimVisibility
  value: BlobClaimValue | StringClaimValue

  constructor(
    name: string,
    visibility: ClaimVisibility,
    value: BlobClaimValue | StringClaimValue,
  ) {
    this.name = name
    this.visibility = visibility
    this.value = value
  }
}

/**
 * Base class for a Sudo
 */
export abstract class Base {
  id?: string = undefined
  version = 1
  createdAt: Date
  updatedAt: Date

  constructor(
    id?: string,
    version = 1,
    createdAt: Date = new Date(0),
    updatedAt: Date = new Date(0),
  ) {
    this.version = version
    this.createdAt = createdAt
    this.updatedAt = updatedAt
    this.id = id
  }
}

/**
 * Represents a Sudo.
 *
 * @param id globally unique identifier of this Sudo. This is generated and set by Sudo service.
 * @param version current version of this Sudo.
 * @param createdAt date and time at which this Sudo was created.
 * @param updatedAt date and time at which this Sudo was last updated.
 * @param claims claims.
 * @param metadata arbitrary metadata set by the backend..
 */
export class Sudo extends Base {
  private static TITLE = 'title'
  private static FIRST_NAME = 'firstName'
  private static LAST_NAME = 'lastName'
  private static LABEL = 'label'
  private static NOTES = 'notes'
  private static AVATAR = 'avatar'
  private static EXTERNAL_ID = 'ExternalId'

  private _metadata: Map<string, string> = new Map<string, string>()
  private _claims: Map<string, Claim> = new Map<string, Claim>()

  constructor(
    id?: string,
    version = 1,
    createdAt: Date = new Date(0),
    updatedAt: Date = new Date(0),
    metadata: Map<string, string> = new Map<string, string>(),
    claims: Map<string, Claim> = new Map<string, Claim>(),
  ) {
    super(id, version, createdAt, updatedAt)

    this._metadata = metadata
    this._claims = claims
  }

  /**
   * Title
   */
  public get title(): string | undefined {
    return this._claims.get(Sudo.TITLE)?.value.value as string | undefined
  }
  public set title(value: string | undefined) {
    if (value) {
      this._claims.set(
        Sudo.TITLE,
        new Claim(
          Sudo.TITLE,
          ClaimVisibility.Private,
          new StringClaimValue(value),
        ),
      )
    }
  }

  /**
   * First name
   */
  public get firstName(): string | undefined {
    return this._claims.get(Sudo.FIRST_NAME)?.value.value as string | undefined
  }
  public set firstName(value: string | undefined) {
    if (value) {
      this._claims.set(
        Sudo.FIRST_NAME,
        new Claim(
          Sudo.FIRST_NAME,
          ClaimVisibility.Private,
          new StringClaimValue(value),
        ),
      )
    }
  }

  /**
   * Last name
   */
  public get lastName(): string | undefined {
    return this._claims.get(Sudo.LAST_NAME)?.value.value as string | undefined
  }
  public set lastName(value: string | undefined) {
    if (value) {
      this._claims.set(
        Sudo.LAST_NAME,
        new Claim(
          Sudo.LAST_NAME,
          ClaimVisibility.Private,
          new StringClaimValue(value),
        ),
      )
    }
  }

  /**
   * Label
   */
  public get label(): string | undefined {
    return this._claims.get(Sudo.LABEL)?.value.value as string | undefined
  }
  public set label(value: string | undefined) {
    if (value) {
      this._claims.set(
        Sudo.LABEL,
        new Claim(
          Sudo.LABEL,
          ClaimVisibility.Private,
          new StringClaimValue(value),
        ),
      )
    }
  }

  /**
   * Notes.
   */
  public get notes(): string | undefined {
    return this._claims.get(Sudo.NOTES)?.value.value as string | undefined
  }
  public set notes(value: string | undefined) {
    if (value) {
      this._claims.set(
        Sudo.NOTES,
        new Claim(
          Sudo.NOTES,
          ClaimVisibility.Private,
          new StringClaimValue(value),
        ),
      )
    }
  }

  /**
   * Avatar image URI.
   */
  public get avatar(): URL | undefined {
    return this._claims.get(Sudo.AVATAR)?.value.value as URL | undefined
  }

  public getAvatarFile(): ArrayBuffer | undefined {
    const blobClaim = this._claims.get(Sudo.AVATAR)?.value as BlobClaimValue
    return !blobClaim ? undefined : blobClaim.file
  }

  public setAvatar(value: ArrayBuffer): void {
    if (value) {
      this._claims.set(
        Sudo.AVATAR,
        new Claim(
          Sudo.AVATAR,
          ClaimVisibility.Private,
          new BlobClaimValue(undefined, value),
        ),
      )
    }
  }

  /**
   * External ID associated with this Sudo.
   */
  public get externalId(): string | undefined {
    return this._metadata.get(Sudo.EXTERNAL_ID)
  }

  /**
   * Claims
   */
  public get claims(): Map<string, Claim> {
    return this._claims
  }

  public set claims(value: Map<string, Claim>) {
    this._claims = value
  }
}
