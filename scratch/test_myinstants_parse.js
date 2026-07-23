const https = require('https');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

function parseMyInstantsHtml(html) {
  const results = [];
  const re = /onclick="play\('([^']+)',\s*'[^']+',\s*'([^']+)'\)"[\s\S]*?<a href="\/en\/instant\/([^"]+)"[^>]*>([^<]*)<\/a>/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(html)) !== null) {
    const path = m[1];
    const slug = m[3].replace(/\/$/, '');
    const name = m[4].trim();
    if (seen.has(slug)) continue;
    seen.add(slug);
    results.push({
      slug,
      name,
      soundUrl: path.startsWith('http') ? path : `https://www.myinstants.com${path}`,
    });
  }
  return results;
}

(async () => {
  const html = await fetch('https://www.myinstants.com/en/search/?name=bruh');
  console.log(parseMyInstantsHtml(html).slice(0, 5));
})();
