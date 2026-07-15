const BOC_URL = "https://www.boc.cn/sourcedb/whpj/";

const AUD_ROW_RE = /<tr data-currency='澳大利亚元'>([\s\S]*?)<\/tr>/;
const TD_RE = /<td[^>]*>([^<]*)<\/td>/g;

export interface BocAudRate {
  /** 现汇卖出价 */
  exchangeSell: number;
  /** 发布日期 + 发布时间, e.g. "2026/07/15 14:47:21" */
  publishDateTime: string;
  /** date part only, e.g. "2026/07/15" */
  publishDate: string;
}

export async function fetchBocHtml(): Promise<string> {
  const res = await fetch(BOC_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; fx-rate-bot/1.0)" },
  });
  if (!res.ok) {
    throw new Error(`BOC fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

export function parseAudRate(html: string): BocAudRate {
  const rowMatch = AUD_ROW_RE.exec(html);
  if (!rowMatch) {
    throw new Error("AUD row not found in BOC page");
  }

  const cells: string[] = [];
  TD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TD_RE.exec(rowMatch[1] ?? ""))) {
    cells.push((m[1] ?? "").trim());
  }

  // [货币名称, 现汇买入价, 现钞买入价, 现汇卖出价, 现钞卖出价, 中行折算价, 发布日期, 发布时间]
  const publishDateTime = cells[6];
  const exchangeSell = Number(cells[3]);

  if (cells.length < 8 || !publishDateTime || !Number.isFinite(exchangeSell)) {
    throw new Error(`Unexpected AUD row shape: ${JSON.stringify(cells)}`);
  }

  return {
    exchangeSell,
    publishDateTime,
    publishDate: publishDateTime.split(" ")[0] ?? publishDateTime,
  };
}

/** Today's date in Asia/Shanghai, formatted "YYYY/MM/DD" to match BOC's 发布日期 format. */
export function todayInShanghai(now: Date = new Date()): string {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return formatted.replaceAll("-", "/");
}
