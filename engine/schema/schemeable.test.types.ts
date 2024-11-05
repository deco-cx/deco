import type { InstanceOf, PreactComponent } from "../../engine/block.ts";
import type { Resolvable } from "../../engine/core/resolver.ts";

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
   * @title Email
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
  resolvable: Resolvable;
  // @ts-ignore: "will work as soon as the new engine is entirely here"
  preactComponent: PreactComponent<InstanceOf<string, "#/root/sections">>;
}

export interface ComplexType {
  title: string;
  jsonLD: string;
}

export interface TypeWithExtendsOmit extends Omit<ComplexType, "jsonLD"> {
  page: number;
}

export { type MyDataUriType } from "data:text/tsx,export interface MyDataUriType { a: string; };";

export interface WithAnonTypes {
  /**
   * @title Cards
   */
  items: {
    title: string;
    /**
     * @format rich-text
     */
    description: string;
    buttons: Array<{
      label: string;
      /**
       * @format url
       */
      url: string;
      position: "left" | "right" | "center";
    }>;
  }[];
}
