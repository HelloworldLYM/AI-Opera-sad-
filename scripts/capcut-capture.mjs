import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const runtimeRequire = createRequire(
  'C:/Users/20360/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json',
);
const { chromium } = runtimeRequire('playwright');

const shareUrl = process.argv[2] ?? 'https://www.capcut.cn/share/7640709201190196542?t=1';
const outputDir = path.resolve('.codex-capcut');
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});

const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});

const seen = [];
page.on('response', async (response) => {
  const url = response.url();
  if (
    /share_detail_query|cluster_list|mget_draft_assets|owner_share_list|play|video|tos|vod|mp4/i.test(url)
  ) {
    const entry = {
      url,
      status: response.status(),
      headers: response.headers(),
    };
    const contentType = response.headers()['content-type'] ?? '';
    if (/json|text|javascript|html/.test(contentType)) {
      try {
        entry.body = (await response.text()).slice(0, 500000);
      } catch {
        entry.body = null;
      }
    }
    seen.push(entry);
  }
});

await page.goto(shareUrl, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(10000);

const pageData = await page.evaluate(() => {
  const videos = Array.from(document.querySelectorAll('video')).map((video) => ({
    src: video.currentSrc || video.src || '',
    poster: video.poster || '',
    width: video.videoWidth,
    height: video.videoHeight,
    duration: video.duration,
    html: video.outerHTML,
  }));
  const links = Array.from(document.querySelectorAll('a, source')).map((el) => ({
    tag: el.tagName,
    href: el.href || el.src || '',
    text: el.textContent?.trim() || '',
  }));
  return {
    title: document.title,
    location: location.href,
    videos,
    links,
    bodyText: document.body?.innerText?.slice(0, 20000) ?? '',
  };
});

await fs.writeFile(
  path.join(outputDir, 'capture.json'),
  JSON.stringify({ shareUrl, pageData, responses: seen }, null, 2),
  'utf8',
);

console.log(JSON.stringify({ output: path.join(outputDir, 'capture.json'), pageData, responseCount: seen.length }, null, 2));

await browser.close();
