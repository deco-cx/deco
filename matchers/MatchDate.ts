import Cron from "https://deno.land/x/croner@6.0.3/dist/croner.js";

/**
 * @titleBy start
 */
export interface DateProps {
  /**
   * @format date-time
   */
  start?: string;
  /**
   * @format date-time
   */
  end?: string;
}

/**
 * @titleBy cron
 */
export interface CronProps {
  /**
   * @format cron
   */
  cron: string;
}

const isDateProps = (props: Props): props is DateProps => {
  return (props as CronProps)?.cron === undefined;
};
export type Props = CronProps | DateProps;

const addMSToDate = (date: Date, ms: number) => {
  const currentTimeAsMs = date.getTime();

  const adjustedTimeAsMs = currentTimeAsMs + ms;

  const adjustedDateObj = new Date(adjustedTimeAsMs);
  return adjustedDateObj;
};

const ONE_MINUTE_MS = 60_000;

function nowWithMinutePrecision() {
  const date = new Date();
  date.setSeconds(0);
  date.setMilliseconds(0);
  date.setTime(Math.floor(date.getTime() / 1000) * 1000);
  return date;
}

/**
 * @title Match Date.
 */
const MatchDate = (props: Props) => {
  const now = new Date();
  if (isDateProps(props)) {
    const start = props.start ? now > new Date(props.start) : true;
    const end = props.end ? now < new Date(props.end) : true;
    return start && end;
  }
  const minutePrecision = nowWithMinutePrecision(); // cron jobs has only minutes precision

  const cron = new Cron(props.cron);
  return cron.nextRun(addMSToDate(minutePrecision, -ONE_MINUTE_MS))
    ?.getTime() === minutePrecision.getTime();
};

export default MatchDate;
