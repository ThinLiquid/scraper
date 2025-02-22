import { existsSync, mkdirSync } from 'fs';
import { fetchPage } from './fetcher';
import { visitedUrls } from './caches';
import { Signale } from 'signale';
import { MAX_DEPTH } from './constants';

const logger = new Signale({
  scope: 'main'
})

export const crawl = async (startingUrls: string[]) => {
  console.log(startingUrls);
  let pendingUrls = new Set<[string, string[]?, number?, boolean?]>(
    startingUrls.map(x => [x])
  );
  console.log(pendingUrls.entries());
  let nextDepthUrls = new Set<[string, string[]?, number?, boolean?]>();
  let seenUrls = new Set<string>(); // Track seen URLs to prevent duplicates
  let depth = 0;

  while (pendingUrls.size > 0 && depth < MAX_DEPTH) {
    logger.info(`Crawling depth ${depth} with ${pendingUrls.size} URLs`);
    const crawlPromises = Array.from(pendingUrls).map(args => fetchPage(args[0], args[1], depth, args[3]));
    const results = await Promise.all(crawlPromises);
    
    results.forEach(hrefsArray => {
      if (hrefsArray) {
        hrefsArray.forEach(args => {
          const urlObject = new URL(args[0]);
          const normalizedUrl = urlObject.origin + urlObject.pathname;

          if (!visitedUrls.has(normalizedUrl) && !seenUrls.has(normalizedUrl)) {
            seenUrls.add(normalizedUrl); // Mark as seen
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