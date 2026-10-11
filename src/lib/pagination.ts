/** Read every page, including when the server applies a smaller response cap. */
export async function fetchAllPages<T>(fetchPage: (from: number, to: number) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = []
  const pageSize = 500
  for (;;) {
    const page = await fetchPage(rows.length, rows.length + pageSize - 1)
    if (page.length === 0) return rows
    rows.push(...page)
  }
}
