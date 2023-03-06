export interface Props {
  traffic: number;
  session: boolean;
}

const MatchRandom = ({ traffic, session }: Props) => {
  const isMatch = Math.random() < traffic;
  const duration = session ? "session" : "request";
  return { isMatch, duration };
};

export default MatchRandom;
