import Cron from "https://deno.land/x/croner@6.0.3/dist/croner.js";

/**
 * @titleBy cron
 */
export interface CronProps {
  /**
   * @format cron
   * @pattern ^(?:(?:[0-5]?[0-9](?:(?:\/|-)[0-5]?[0-9])?|\*|[SMTWF][a-z]{2})(?:(?:\s+|\t+)(?:[0-5]?[0-9](?:(?:\/|-)[0-5]?[0-9])?|\*|[SMTWF][a-z]{2})(?:(?:\s+|\t+)(?:[0-5]?[0-9](?:(?:\/|-)[0-5]?[0-9])?|\*|[SMTWF][a-z]{2})(?:(?:\s+|\t+)(?:[0-5]?[0-9](?:(?:\/|-)[0-5]?[0-9])?|\*|[SMTWF][a-z]{2})(?:(?:\s+|\t+)(?:[0-7](?:\/|-)[0-7])?))))))$
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

const MatchCron = (props: CronProps) => {
  const minutePrecision = nowWithMinutePrecision(); // cron jobs has only minutes precision

  const cron = new Cron(props.cron);
  return cron.nextRun(addMSToDate(minutePrecision, -ONE_MINUTE_MS))
    ?.getTime() === minutePrecision.getTime();
};

export default MatchCron;
