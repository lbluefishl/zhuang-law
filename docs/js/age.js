const MS_PER_DAY = 86400000;
const DAYS_PER_MONTH = 30.44; // average — good enough for a display label, not stored anywhere

// Extracts a date's Y/M/D as seen in the viewer's own timezone, then
// reconstructs that as a UTC timestamp purely for arithmetic. Two purposes:
// it makes "how many days apart" a comparison of calendar dates rather than
// raw instants (a photo taken at 1am and one taken at 11am on the same
// local day must count as the same day, not almost a full day apart just
// because one has an earlier UTC timestamp than the other), and using
// Date.UTC rather than plain local-midnight subtraction sidesteps DST — a
// local day during a clock-change is 23 or 25 real hours, not a clean
// 86400000ms multiple.
function localDateOnly(d) {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

// "Week 3" for the first ~8 weeks, then "Month 2" onward — see §6. Takes Date
// objects (or anything `new Date()` accepts) for both dateTaken and referenceDate.
// `dict` + `t` are optional (imported lazily by the caller, not this module,
// to keep age.js free of an i18n.js dependency) — omit both for the plain
// English strings.
export function ageLabel(dateTaken, referenceDate, dict, t) {
  // Compared as calendar dates (see localDateOnly), not raw UTC instants —
  // two photos both taken on the same LOCAL calendar day must land in the
  // same bucket, even if one's stored UTC timestamp is technically on the
  // previous UTC day (e.g. 1am AEST is still the previous day in UTC).
  const ageDays = Math.round((localDateOnly(new Date(dateTaken)) - localDateOnly(new Date(referenceDate))) / MS_PER_DAY);
  if (ageDays < 0) return dict && t ? t(dict, 'age.before_birth') : 'Before birth';

  const weekNum = Math.floor(ageDays / 7) + 1;
  if (weekNum <= 8) return dict && t ? t(dict, 'age.week', { n: weekNum }) : `Week ${weekNum}`;

  const monthNum = Math.floor(ageDays / DAYS_PER_MONTH) + 1;
  return dict && t ? t(dict, 'age.month', { n: monthNum }) : `Month ${monthNum}`;
}
