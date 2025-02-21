import { existsSync, mkdirSync } from 'fs';
import { fetchPage } from './fetcher.ts';
import { visitedUrls } from './caches.ts';

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

    // @ts-ignore
    queue.push(...newHrefs);
  }
};

start();
