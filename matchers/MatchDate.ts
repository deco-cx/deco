/**
 * @titleBy start
 */
export interface Props {
  /**
   * @format date-time
   */
  start?: string;
  /**
   * @format date-time
   */
  end?: string;
}

const MatchDate = (props: Props) => {
  const now = new Date();
  const start = props.start ? now > new Date(props.start) : true;
  const end = props.end ? now < new Date(props.end) : true;
  return start && end;
};

export default MatchDate;
