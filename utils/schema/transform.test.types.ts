import type { LoaderReturnType } from '$live/std/types.ts';

export type SimpleType = {
  name: string
}

export interface SimpleInterface {
  name: string
}

export interface NonRequiredFields {
  name: string
  maybeName?: string
}

export interface UnionTypes {
  name: string | number
}

export interface ArrayFields {
  array: string[]
}

export interface InterfaceWithTypeRef {
  ref: SimpleInterface
}

export interface WithTags {
  /** 
   * @title email
   * @description add your email
   * @format email
   * */
  email: string
}

export type TypeAlias = string

export interface BuiltInTypes {
  array: Array<string>
  record: Record<string, string>
  loaderReturnType: LoaderReturnType<string[]>
}