import { JSX } from "preact";
import { usePartialSection } from "../hooks/usePartialSection.ts";

export function Form(props: JSX.IntrinsicElements["form"]) {
  return (
    <form {...props} method="POST" action={usePartialSection()["f-partial"]} />
  );
}
