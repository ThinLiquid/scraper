import { existsSync, mkdirSync } from 'fs';
import { fetchPage } from './fetcher.ts';
import { visitedUrls } from './caches.ts';
import { Signale } from 'signale';
import { MAX_DEPTH } from './constants.ts';

const logger = new Signale({
  scope: 'main'
})

function uniq(a) {
  var seen = {};
  return a.filter(function(item) {
      return seen.hasOwnProperty(item) ? false : (seen[item] = true);
  });
}

const start = async () => {
  const queue: [string, string[]?, number?, boolean?][] = [
    /*['https://districts.nekoweb.org'],
    ['https://thinliquid.dev'],
    ['https://theabsoluterealm.com/main/CoolStuff/buttondex'],
    ['https://neonaut.neocities.org/cyber/88x31'],*/
    [process.argv[2]]
  ];

  if (!existsSync('./buttons')) mkdirSync('./buttons');

  while (queue.length > 0) {
    const batch = queue.splice(0, 20);
    const urls = batch.map(x => x[0])
    console.log(urls)
    const newHrefs = uniq(
      (await Promise.all(batch.map(args =>
        fetchPage(...args)
      )))
        .flat()
        .map((x) => {
          if (x == null || visitedUrls.has(x[0])) return null
          if (x[2] != null) x[2]++
          return x
        })
        .filter(x => x != null)
    )

    queue.push(...newHrefs);
  }
};

export const crawl = async (startingUrl: string) => {
  let pendingUrls = new Set<string>([startingUrl]);
  let nextDepthUrls = new Set<string>();
  let depth = 0;

  while (pendingUrls.size > 0 && depth < MAX_DEPTH) {
    logger.info(`Crawling depth ${depth} with ${pendingUrls.size} URLs`);
    const crawlPromises = Array.from(pendingUrls).map(url => fetchPage(url, [], depth, false));
    const results = await Promise.all(crawlPromises);
    results.forEach(hrefsArray => {
      if (hrefsArray) {
        hrefsArray.forEach(([url]) => {
          const urlObject = new URL(url);
          const normalizedUrl = urlObject.origin + urlObject.pathname;
          if (!visitedUrls.has(normalizedUrl)) {
            nextDepthUrls.add(url);
          }
        });
      }
    });
    pendingUrls = nextDepthUrls;
    nextDepthUrls = new Set<string>();
    depth++;
  }
};

const urls = process.argv.splice(2)
await Promise.all(urls.map(x => crawl(x)))