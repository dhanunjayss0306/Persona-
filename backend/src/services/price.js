// Read only explicit INR product price metadata from supported retailer pages.
// Retail pages often block automated checks or omit structured data. In those
// cases return null instead of guessing from unrelated currency amounts.
const MERCHANTS = ['amazon.in', 'flipkart.com', 'croma.com', 'myntra.com', 'ajio.com'];
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-IN,en;q=0.9',
};

function supportedProductUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (!url.port || url.port === '443') && MERCHANTS.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch { return false; }
}

function numericPrice(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const n = Number(String(value).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) && n > 0 && n < 100000000 ? n : null;
}

function productNodes(value, out = []) {
  if (Array.isArray(value)) { value.forEach((item) => productNodes(item, out)); return out; }
  if (!value || typeof value !== 'object') return out;
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  if (types.some((type) => String(type).toLowerCase() === 'product')) out.push(value);
  if (value['@graph']) productNodes(value['@graph'], out);
  return out;
}

function offerPrices(product) {
  const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
  const prices = [];
  for (const offer of offers) {
    if (!offer || typeof offer !== 'object' || String(offer.priceCurrency || '').toUpperCase() !== 'INR') continue;
    const price = numericPrice(offer.price) ?? numericPrice(offer.lowPrice);
    if (price !== null) prices.push(price);
  }
  return prices;
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

function extractPrice(html) {
  const candidates = [];
  const scripts = html.matchAll(/<script\b(?=[^>]*\btype\s*=\s*["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script\s*>/gi);
  for (const match of scripts) {
    try { productNodes(JSON.parse(match[1])).forEach((product) => candidates.push(...offerPrices(product))); }
    catch { /* Ignore malformed structured data and continue to explicit metadata. */ }
  }
  if (!candidates.length) {
    const tags = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
    const valueFor = (key, name) => tags.filter((tag) => (attr(tag, key) || '').toLowerCase() === name.toLowerCase()).map((tag) => attr(tag, 'content')).filter(Boolean);
    const currencies = [
      ...valueFor('itemprop', 'priceCurrency'),
      ...valueFor('property', 'product:price:currency'),
      ...valueFor('property', 'og:price:currency'),
    ].map((v) => v.toUpperCase());
    if (currencies.includes('INR')) {
      const raw = [
        ...valueFor('itemprop', 'price'),
        ...valueFor('property', 'product:price:amount'),
        ...valueFor('property', 'og:price:amount'),
      ];
      candidates.push(...raw.map(numericPrice).filter((n) => n !== null));
    }
  }
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique[0] : null;
}

async function fetchPrice(value) {
  if (!supportedProductUrl(value)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    let url = new URL(value);
    // Do not follow a merchant redirect to an arbitrary host. A redirect can
    // otherwise turn a product check into a server-side request forgery.
    let response;
    for (let redirects = 0; redirects <= 3; redirects++) {
      response = await fetch(url, { headers: HEADERS, signal: controller.signal, redirect: 'manual' });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      if (!location || redirects === 3) return null;
      url = new URL(location, url);
      if (!supportedProductUrl(url.href)) return null;
    }
    if (!response?.ok || !/text\/html/i.test(response.headers.get('content-type') || '')) return null;
    return extractPrice(await response.text());
  } catch { return null; }
  finally { clearTimeout(timer); }
}

module.exports = { fetchPrice, extractPrice, supportedProductUrl };
