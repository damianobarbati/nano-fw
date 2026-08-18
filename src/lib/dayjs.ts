import dayjs, { type PluginFunc } from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween.js';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import localeData from 'dayjs/plugin/localeData.js';
import localizedFormat from 'dayjs/plugin/localizedFormat.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import tz from 'dayjs/plugin/timezone.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import weekday from 'dayjs/plugin/weekday.js';
import 'dayjs/locale/en.js';
import 'dayjs/locale/it.js';
import 'dayjs/locale/de.js';
import 'dayjs/locale/fr.js';
import 'dayjs/locale/pt.js';
import 'dayjs/locale/es.js';

dayjs.extend(weekday);
dayjs.extend(timezone);
dayjs.extend(isoWeek);
dayjs.extend(utc);
dayjs.extend(tz);
dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);
dayjs.extend(localeData);
dayjs.extend(isBetween);

const noMsPlugin: PluginFunc = (_, DayjsClass) => {
  // @ts-expect-error
  const oldParse = DayjsClass.prototype.parse;

  // @ts-expect-error
  DayjsClass.prototype.parse = function (cfg) {
    const res = oldParse.bind(this)(cfg);
    // @ts-expect-error
    this.$d.setMilliseconds(0);
    return res;
  };

  const oldToISOString = DayjsClass.prototype.toISOString;
  DayjsClass.prototype.toISOString = function () {
    return oldToISOString.apply(this).replace(/\.\d{3}Z$/, 'Z');
  };
};

dayjs.extend(noMsPlugin);

export default dayjs;

// patch Date constructor for iOS bug (browser only)
if (typeof window !== 'undefined') {
  ((NativeDate) => {
    const standardizeArgs = (...args) => (args.length === 1 && typeof args[0] === 'string' && Number.isNaN(NativeDate.parse(args[0])) ? [args[0].replace(/-/g, '/')] : args);

    function PatchedDate(...args) {
      // @ts-expect-error
      return this instanceof PatchedDate ? new NativeDate(...standardizeArgs(...args)) : NativeDate();
    }

    PatchedDate.prototype = NativeDate.prototype;
    PatchedDate.now = NativeDate.now;
    PatchedDate.UTC = NativeDate.UTC;
    // @ts-expect-error
    PatchedDate.parse = (...args) => NativeDate.parse(...standardizeArgs(...args));
    // @ts-expect-error
    window.Date = PatchedDate;
  })(window.Date);
}
