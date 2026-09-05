import { ApiError } from "../../lib/http";
import { databaseError } from "../../lib/supabase";

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** A cap produces an explicit error, never a silently incomplete analysis. */
export async function allRows<T>(
  fetchPage: (from: number, to: number) => Page<T>,
  label: string,
  maximum = 50_000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from <= maximum; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999);
    if (error) throw databaseError(error, `Unable to load ${label}`);
    rows.push(...(data ?? []));
    if (rows.length > maximum)
      throw new ApiError(
        422,
        "Too much data for one analysis. Select fewer years, questions or companies.",
        "scope_too_large",
      );
    if ((data?.length ?? 0) < 1000) return rows;
  }
  return rows;
}
