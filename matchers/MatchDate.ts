export interface Props {
  /**
   * @format date-time
   */
  start?: string;
  /**
   * @format date-time
   */
  end?: string;
  session: boolean;
}

const MatchDate = (props: Props) => {
  const now = new Date();
  const start = props.start ? now > new Date(props.start) : true;
  const end = props.end ? now < new Date(props.end) : true;
  const duration = props.session ? "session" : "request";
  return { isMatch: start && end, duration };
};

export default MatchDate;
