// services/price.js — best-effort price reader.
//
// There is NO official price API for Amazon/Flipkart/Croma, so we fetch the
// product page like a browser and look for a ₹ price in the HTML.
// Honest limits: Amazon aggressively blocks bots (may return nothing);
// Flipkart/Croma usually work. The caller must handle null gracefully.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  'Accept-Language': 'en-IN,en;q=0.9',
};

async function fetchPrice(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();

    // Look for ₹ amounts near price-ish keywords, take the most plausible.
    const matches = [...html.matchAll(/₹\s?([\d,]+(?:\.\d{1,2})?)/g)]
      .map((m) => Number(m[1].replace(/,/g, '')))
      .filter((n) => n > 10 && n < 10000000);
    if (!matches.length) return null;

    // Heuristic: the price shown most often on the page is usually the real one.
    const counts = {};
    matches.forEach((n) => { counts[n] = (counts[n] || 0) + 1; });
    return Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
  } catch {
    return null;
  }
}

module.exports = { fetchPrice };
