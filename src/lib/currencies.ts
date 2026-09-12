export const CURRENCIES = [
  {
    code: "CDF",
    country: "DR Congo",
    flag: "🇨🇩",
  },
  {
    code: "RWF",
    country: "Rwanda",
    flag: "🇷🇼",
  },
  {
    code: "UGX",
    country: "Uganda",
    flag: "🇺🇬",
  },
  {
    code: "KES",
    country: "Kenya",
    flag: "🇰🇪",
  },
  {
    code: "BIF",
    country: "Burundi",
    flag: "🇧🇮",
  },
  {
    code: "ETB",
    country: "Ethiopia",
    flag: "🇪🇹",
  },
  {
    code: "USD",
    country: "United States",
    flag: "🇺🇸",
  },
  {
    code: "CAD",
    country: "Canada",
    flag: "🇨🇦",
  },
  {
    code: "CNY",
    country: "China",
    flag: "🇨🇳",
  },
] as const;

export function getCurrency(code: string) {
  return CURRENCIES.find(
    (currency) => currency.code === code
  );
}