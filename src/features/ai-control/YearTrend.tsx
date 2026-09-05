import type { ComparisonChart } from "./types";
const format = (value: number) =>
  new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);

export function YearTrend({ charts }: { charts: ComparisonChart[] }) {
  const fields = [
    ...new Set(charts.filter((c) => c.aggregate.average !== undefined).map((c) => c.field ?? "")),
  ];
  return (
    <>
      {fields.map((field) => {
        const rows = charts
          .filter((c) => (c.field ?? "") === field && c.aggregate.average !== undefined)
          .sort((a, b) => a.reporting_year - b.reporting_year);
        if (rows.length < 2) return null;
        const compatible = rows.every(
          (row) =>
            Boolean(row.comparison_key) &&
            row.comparison_key === rows[0].comparison_key &&
            row.unit === rows[0].unit,
        );
        const distinctYears = new Set(rows.map((row) => row.reporting_year)).size === rows.length;
        return (
          <section key={field} className="mt-5 rounded-lg border border-slate-300 bg-slate-50 p-4">
            <h3 className="font-bold">Year-to-year comparison{field ? ` · ${field}` : ""}</h3>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              Unit: {rows[0].unit ?? "as reported"}. These are group averages; participating
              companies can differ by year. Response counts exclude missing or invalid values.
            </p>
            {!compatible || !distinctYears ? (
              <p className="mt-3 text-sm text-amber-900">
                Automatic changes are not calculated because the question structure differs or
                multiple surveys share a reporting year. Review the separate survey charts below.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {["Year", "Average", "Change", "Responses"].map((label) => (
                        <th key={label} className="p-2">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => {
                      const change = index
                        ? row.aggregate.average! - rows[index - 1].aggregate.average!
                        : null;
                      return (
                        <tr key={row.survey_version_id} className="border-t border-slate-200">
                          <th className="p-2">{row.reporting_year}</th>
                          <td className="p-2 tabular-nums">{format(row.aggregate.average!)}</td>
                          <td className="p-2 tabular-nums">
                            {change === null ? "—" : `${change > 0 ? "+" : ""}${format(change)}`}
                          </td>
                          <td className="p-2">{row.aggregate.responses}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {rows.some((row) => row.survey_name.includes("[TEST DATA]")) && (
              <p className="mt-3 text-xs font-semibold text-amber-900">
                Includes synthetic test data. These values are not real company disclosures.
              </p>
            )}
          </section>
        );
      })}
    </>
  );
}
