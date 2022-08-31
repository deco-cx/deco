/** @jsx h */
/** @jsxFrag Fragment */
import { Fragment, h } from "preact";
import { tw } from "twind";
import PropInput, { Props as PropInputProps } from "./PropInput.tsx";

interface Props {
  /**
   * It's a component prop schema
   */
  props: Record<string, any>;
  /**
   * propPrefix is used for nested values
   */
  propPrefix: string;
  /**
   * @param value - is the prop value;
   * @param path - is the full path to the value
   */
  onInput: (value: any, path: string) => void;
}

export default function PropsInputs({ props, propPrefix, onInput }: Props) {
  return (
    <>
      {Object.entries(props).map(([prop, value]) => {
        if (typeof value === "object") {
          return (
            <PropsInputs
              props={value}
              propPrefix={`${propPrefix}${prop}.`}
              onInput={onInput}
            />
          );
        }

        const defaultProps: PropInputProps = {
          prop,
          id: prop,
          name: prop,
          value: props[prop],
          onChange: (e) => onInput(e.target?.value, propPrefix.concat(prop)),
        };

        let customProps: PropInputProps = {} as PropInputProps;

        if (typeof value === "boolean") {
          customProps = {
            ...customProps,
            type: "checkbox",
            onChange: () => onInput(!value, propPrefix.concat(prop)),
          };
        }

        return (
          <PropInput
            {...defaultProps}
            {...customProps}
          />
        );
      })}
    </>
  );
}
