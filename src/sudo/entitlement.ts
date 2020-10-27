/**
 * Represents an entitlement related to using Sudo service APIs. Currently only entitlement that's used
 * in Sudo service is "sudoplatform.sudo.max" to represent the maximum number of Sudos each user
 * is allowed to provision.
 *
 * @param name entitlement name, e.g "sudoplatform.sudo.max" for maximum number of Sudos.
 * @param value entitlement value.
 */
export class Entitlement {
  private _name: string | undefined
  private _value: number | undefined

  constructor(name: string, value: number) {
    this._name = name
    this._value = value
  }

  public get name(): string | undefined {
    return this._name
  }

  public set name(value: string | undefined) {
    this._name = value
  }

  public get value(): number | undefined {
    return this._value
  }

  public set value(value: number | undefined) {
    this._value = value
  }
}
