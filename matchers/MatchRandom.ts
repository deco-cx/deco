export interface Props {
  traffic: number;
}

const MatchRandom = ({ traffic }: Props) => {
  return Math.random() < traffic;
};

export default MatchRandom;
