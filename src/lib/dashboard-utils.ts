export const age = (value: string | null) => {
  if (!value) return "Няма данни";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Няма данни";

  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `преди ${minutes} мин`;
  if (minutes < 1440) return `преди ${Math.round(minutes / 60)} ч`;
  return `преди ${Math.round(minutes / 1440)} дни`;
};
