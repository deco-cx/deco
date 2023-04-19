import { InstanceOf, PreactComponent } from "$live/engine/block.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";

export type SimpleType = {
  name: string;
};

export interface SimpleInterface {
  name: string;
}

export interface NonRequiredFields {
  name: string;
  maybeName?: string;
}

export interface UnionTypes {
  name: string | number;
}

export interface ArrayFields {
  array: string[];
}

export interface InterfaceWithTypeRef {
  ref: SimpleInterface;
}

export interface WithTags {
  /**
   * @title email
   * @description add your email
   * @format email
   */
  email: string;
}

export type TypeAlias = string;

export type TwoRefsProperties = {
  firstRef: SimpleInterface[];
  anotherRef: SimpleInterface[];
};

export interface WellKnown {
  array: Array<string>;
  record: Record<string, string>;
  // @ts-ignore: "will work as soon as the new engine is entirely here"
  section: InstanceOf<string, "#/root/sections">;
  promiseValue: Promise<string>;
  resolvable: Resolvable<string>;
  // @ts-ignore: "will work as soon as the new engine is entirely here"
  preactComponent: PreactComponent<InstanceOf<string, "#/root/sections">>;
}
