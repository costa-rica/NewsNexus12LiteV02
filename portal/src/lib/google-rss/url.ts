const GOOGLE_RSS_BASE_URL = "https://news.google.com/rss/search";

export function buildGoogleRssUrl(query: string) {
  const params = new URLSearchParams({
    q: query,
    hl: process.env.GOOGLE_RSS_HL || "en-US",
    gl: process.env.GOOGLE_RSS_GL || "US",
    ceid: process.env.GOOGLE_RSS_CEID || "US:en",
  });

  return `${GOOGLE_RSS_BASE_URL}?${params.toString()}`;
}
