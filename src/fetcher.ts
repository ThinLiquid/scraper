import { HTMLElement, parse } from 'node-html-parser';
import {  hashImage } from './utils.ts';
import { BUTTON_SIZE, MAX_DEPTH, MAX_CONCURRENCY } from './constants.ts';
import { imageCache, visitedUrls } from './caches.ts';
import { Signale } from 'signale';
import { ButtonDB } from './types.ts';
import PQueue from 'p-queue';
import db from './db.ts';
import { ISizeCalculationResult } from 'image-size/dist/types/interface';
import { writeFile } from 'fs/promises'
import sizeOf from 'image-size'

const logger = new Signale({
  scope: 'fetcher',
});

export const queue = new PQueue({ concurrency: MAX_CONCURRENCY });

export const createOrGetHostObject = (
  urlObject: URL,
  hosts: ButtonDB['hosts']
) =>
  hosts[urlObject.host] ??= {
    host: urlObject.host,
    metadata: [],
    buttons: [],
    urls: [],
    paths: [],
  };

export const extractMetadata = ($: ReturnType<typeof parse>) => {
  const title = $.querySelector('title')?.text.trim();
  const keywords = $.querySelector('meta[name=keywords]')?.getAttribute('content')?.trim();
  const description = $.querySelector('meta[name=description]')?.getAttribute('content')?.trim();
    
  return {
    title,
    keywords: keywords?.split(',').map(k => k.trim()),
    description,
  };
};

const pushIfMissing = (arr: any[], value: any) => {
  if (!arr.includes(value)) {
    arr.push(value);
  }
};

/**
 * Process an image element and update (or create) the button record.
 * All database updates for the image are combined in one db.update call.
 */
const processImage = async (
  img: HTMLElement,
  url: string,
  href: string | undefined,
  index: number,
  length: number,
): Promise<[boolean, string[]] | undefined> => {
  let didFindButton = false;
  let src = img.getAttribute('src');
  if (!src) return;
  src = new URL(src, url).toString();

  let buffer: ArrayBuffer | undefined
  const res = await queue.add(() => fetch(src))
  if (!res) return
  buffer = await res.arrayBuffer()

  let size: ISizeCalculationResult | null | undefined | false
  if (imageCache.has(src)) {
    size = imageCache.get(src)?.size
  }
  if (size == false) return
  if (size == null) {
    try {
      size = sizeOf(new Uint8Array(buffer))
    } catch{}
    if (!size || size.width !== BUTTON_SIZE.width || size.height !== BUTTON_SIZE.height) {
      imageCache.set(src, { size: false })
      return;
    }
    didFindButton = true;
    imageCache.set(src, { size })
  }

  let hash: string | undefined
  if (imageCache.has(src)) {
    hash = imageCache.get(src)?.hash
  }
  if (hash == null) {
    hash = await hashImage(buffer)
    imageCache.set(src, { size, hash })
  }

  const alt = img.getAttribute('alt');
  const title = img.getAttribute('title');

  // Combine the update for an existing button and creation of a new one into a single update call.
  await db.updateButton(hash, async (button) => {
    if (button) {
      logger.warn(`(${index}/${length}) [${url}] Duplicate found ${src}, merging into ${hash}`)
      if (!button.foundAt.includes(url)) button.foundAt.push(url);
      if (!button.srcs.includes(src)) button.srcs.push(src);
      if (href && !button.hrefs.includes(href)) button.hrefs.push(href);
      if (alt && !button.alts.includes(alt)) button.alts.push(alt);
      if (title && !button.alts.includes(title)) button.alts.push(title);
      return button;
    } else {
      logger.success(`(${index}/${length}) [${url}] Button found n\' saved: ${src}`)
      await writeFile(`./buttons/${hash}`, new Uint8Array(buffer))
      return {
        srcs: [src],
        alts: alt ? [alt] : [],
        hrefs: href ? [href] : [],
        timestamp: Date.now(),
        foundAt: [url],
        type: size.type
      };
    }
  });

  

  try {
    const buttonHrefHost = new URL(href ?? url).host
    await db.updateHost(buttonHrefHost, (host) => {
      if (host) {
        pushIfMissing(host.buttons, hash)
        return host
      } else {
        return {
          host: buttonHrefHost,
          metadata: [],
          buttons: [hash],
          urls: [url],
          paths: []
        }
      }
    })
  } catch {}
  

  const otherUrls: string[] = [];
  if (href) {
    pushIfMissing(otherUrls, href);
  }

  return [didFindButton, otherUrls];
};

export const fetchPage = async (
  url: string,
  pathHistory: string[] = [],
  depth = 0,
  didLastFindButton = false
): Promise<Array<[string, string[]?, number?, boolean?]> | undefined> => {
  try {
    let urlObject = new URL(url);
    url = urlObject.toString();

    const normalizedUrl = urlObject.origin + urlObject.pathname;
    if (depth >= MAX_DEPTH || visitedUrls.has(normalizedUrl)) return;

    const newPath = [...pathHistory, url];

    let response;
    let $: HTMLElement;
    let hrefs: [string, string[]?, number?, boolean?][] = [];

    try {
      response = await queue.add(() => fetch(url));
      if (!response) return;
      visitedUrls.add(normalizedUrl);
      logger.info(`Fetched ${url} (depth: ${depth})`);

      url = response.url;
      urlObject = new URL(response.url);
      $ = parse(await response.text());
    } catch (error) {
      logger.error(`Error fetching ${url}:`, error.message);
      return;
    }

    let globalIndex = 1;
    const globalLength = $.querySelectorAll('img').length

    await db.updateHost(urlObject.host, async (host) => {
      const metadata = extractMetadata($);

      if (host) {
        pushIfMissing(host.paths, newPath);
        pushIfMissing(host.urls, url);

        if (
          !host.metadata.some(
            m => m.title === metadata.title && m.description === metadata.description
          )
        ) {
          host.metadata.push(metadata);
        }
        return host
      } else {
        return {
          host: urlObject.host,
          metadata: [metadata],
          buttons: [],
          urls: [url],
          paths: [newPath]
        }
      }
    });

    for await (const a of $.querySelectorAll('a')) {
      let href = a.getAttribute('href');
      if (href != null) {
        try { href = new URL(href, url).toString(); } catch (e) {}
      }

      let didFindButton = false;
      for await (const img of a.querySelectorAll('img')) {
        const result = await processImage(img, url, href, globalIndex, globalLength);
        if (result != null) {
          didFindButton = result[0];
          result[1].forEach(x => {
            pushIfMissing(hrefs, [x, newPath, depth, didFindButton]);
          });
        }
        globalIndex++
      }

      try {
        if (href != null) {
          if ((a.querySelector('img') == null && didLastFindButton) || (urlObject.host === new URL(href).host )) {
            pushIfMissing(hrefs, [href, newPath, depth, didFindButton]);
          }
        }
      } catch {}
    }

    for await (const img of $.querySelectorAll('img:not(a img)')) {
      if (img.parentNode.tagName !== 'A') await processImage(img, url, undefined, globalIndex, globalLength);
      globalIndex++
    }

    return hrefs;
    
  } catch (e) {
    try {
      if (e.errno === 0) return await fetchPage(url, pathHistory, depth, didLastFindButton)
      else logger.error('error', e)
    } catch {}
  }
};
