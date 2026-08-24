const MS_PER_DAY = 86400000;
const DAYS_PER_MONTH = 30.44; // average — good enough for a display label, not stored anywhere

// "Week 3" for the first ~8 weeks, then "Month 2" onward — see §6. Takes Date
// objects (or anything `new Date()` accepts) for both dateTaken and referenceDate.
export function ageLabel(dateTaken, referenceDate) {
  const ageDays = Math.floor((new Date(dateTaken) - new Date(referenceDate)) / MS_PER_DAY);
  if (ageDays < 0) return 'Before birth';

  const weekNum = Math.floor(ageDays / 7) + 1;
  if (weekNum <= 8) return `Week ${weekNum}`;

  const monthNum = Math.floor(ageDays / DAYS_PER_MONTH) + 1;
  return `Month ${monthNum}`;
}
