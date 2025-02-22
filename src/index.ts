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

export const crawl = async (startingUrls: string[]) => {
  console.log(startingUrls)
  let pendingUrls = new Set<[string, string[]?, number?, boolean?]>(
    startingUrls.map(x => [x])
  );
  console.log(pendingUrls.entries())
  let nextDepthUrls = new Set<[string, string[]?, number?, boolean?]>();
  let depth = 0;

  while (pendingUrls.size > 0 && depth < MAX_DEPTH) {
    logger.info(`Crawling depth ${depth} with ${pendingUrls.size} URLs`);
    const crawlPromises = Array.from(pendingUrls).map(args => fetchPage(args[0], args[1], args[2] ? args[2] + 1 : args[2], args[3]));
    const results = await Promise.all(crawlPromises);
    results.forEach(hrefsArray => {
      if (hrefsArray) {
        hrefsArray.forEach((args) => {
          const urlObject = new URL(args[0]);
          const normalizedUrl = urlObject.origin + urlObject.pathname;
          if (!visitedUrls.has(normalizedUrl)) {
            nextDepthUrls.add(args);
          }
        });
      }
    });
    pendingUrls = nextDepthUrls;
    nextDepthUrls = new Set<[string, string[]?, number?, boolean?]>();
    depth++;
  }
};

const urls = process.argv.splice(2)
await crawl(urls)