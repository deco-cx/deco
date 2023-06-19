import Cron from "https://deno.land/x/croner@6.0.3/dist/croner.js";

/**
 * @titleBy cron
 */
export interface CronProps {
  /**
   * @format cron
   * @pattern (@(annually|yearly|monthly|weekly|daily|hourly|reboot))|(@every (\d+(ns|us|µs|ms|s|m|h))+)|((((\d+,)+\d+|(\d+(\/|-)\d+)|\d+|\*) ?){5,7})
   */
  cron: string;
}

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
const MatchDate = (props: CronProps) => {
  const minutePrecision = nowWithMinutePrecision(); // cron jobs has only minutes precision

  const cron = new Cron(props.cron);
  return cron.nextRun(addMSToDate(minutePrecision, -ONE_MINUTE_MS))
    ?.getTime() === minutePrecision.getTime();
};

export default MatchDate;
