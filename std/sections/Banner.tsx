export interface Props {
  id: string;
}

export default function Banner(props: Props) {
  console.log("Banner", props);
  return {
    id: props.id,
  };
}
