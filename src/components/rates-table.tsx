import { getCurrency } from "@/lib/currencies";

export type RateRow = {
  id: string;
  rate_date: string;
  currency_from: string;
  currency_to: string;
  buy_rate: number;
  sell_rate: number;
  created_at: string;
};

type RatesTableProps = {
  rates: RateRow[];
};

export default function RatesTable({
  rates,
}: RatesTableProps) {
  if (rates.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
        <p className="text-sm text-gray-500">
          No exchange rates available.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full min-w-[700px]">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Date
            </th>

            <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              From
            </th>

            <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              To
            </th>

            <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
              Buy
            </th>

            <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
              Sell
            </th>

            <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Time
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-200 bg-white">
          {rates.map((rate) => {
            const from = getCurrency(
              rate.currency_from
            );

            const to = getCurrency(
              rate.currency_to
            );

            return (
              <tr
                key={rate.id}
                className="hover:bg-gray-50"
              >
                <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700">
                  {rate.rate_date}
                </td>

                <td className="whitespace-nowrap px-5 py-4">
                  <div className="font-medium text-gray-900">
                    {from?.flag}{" "}
                    {rate.currency_from}
                  </div>

                  {from && (
                    <div className="text-xs text-gray-500">
                      {from.country}
                    </div>
                  )}
                </td>

                <td className="whitespace-nowrap px-5 py-4">
                  <div className="font-medium text-gray-900">
                    {to?.flag}{" "}
                    {rate.currency_to}
                  </div>

                  {to && (
                    <div className="text-xs text-gray-500">
                      {to.country}
                    </div>
                  )}
                </td>

                <td className="whitespace-nowrap px-5 py-4 text-right font-medium text-gray-900">
                  {Number(
                    rate.buy_rate
                  ).toLocaleString(undefined, {
                    maximumFractionDigits: 8,
                  })}
                </td>

                <td className="whitespace-nowrap px-5 py-4 text-right font-medium text-gray-900">
                  {Number(
                    rate.sell_rate
                  ).toLocaleString(undefined, {
                    maximumFractionDigits: 8,
                  })}
                </td>

                <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-500">
                  {new Date(
                    rate.created_at
                  ).toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}