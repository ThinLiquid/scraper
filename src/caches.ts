import type { ISizeCalculationResult } from "image-size/dist/types/interface";
import { writeFileSync, readFileSync, existsSync } from 'fs';

function encodeBuffers(obj: any): any {
  if (obj instanceof ArrayBuffer) {
    return { __arrayBuffer: Buffer.from(obj).toString('base64') };
  } else if (Array.isArray(obj)) {
    return obj.map(encodeBuffers);
  } else if (obj && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, encodeBuffers(value)]));
  }
  return obj;
}

function decodeBuffers(obj: any): any {
  if (obj && typeof obj === 'object') {
    if (obj.__arrayBuffer) {
      return Buffer.from(obj.__arrayBuffer, 'base64').buffer;
    } else if (Array.isArray(obj)) {
      return obj.map(decodeBuffers);
    } else {
      return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, decodeBuffers(value)]));
    }
  }
  return obj;
}

class CacheMap<T, V> {
  map = new Map<T, V>();

  constructor(private path: string) {
    this.load();
  }

  private update() {
    writeFileSync(this.path, JSON.stringify(Array.from(this.map.entries()).map(([key, value]) => [key, encodeBuffers(value)])), 'utf-8');
  }

  private load() {
    if (existsSync(this.path)) {
      const data = JSON.parse(readFileSync(this.path, 'utf-8'));
      this.map = new Map(data.map(([key, value]) => [key, decodeBuffers(value)]));
    }
  }

  get(key: T) {
    return this.map.get(key);
  }

  set(key: T, value: V) {
    this.map.set(key, value);
    this.update();
    return this;
  }

  has(key: T) {
    return this.map.has(key);
  }
}

class CacheSet<T> {
  set = new Set<T>();

  constructor(private path: string) {
    this.load();
  }

  private update() {
    writeFileSync(this.path, JSON.stringify(Array.from(this.set).map(encodeBuffers)), 'utf-8');
  }

  private load() {
    if (existsSync(this.path)) {
      const data = JSON.parse(readFileSync(this.path, 'utf-8'));
      this.set = new Set(data.map(decodeBuffers));
    }
  }

  has(value: T) {
    return this.set.has(value);
  }

  add(value: T) {
    this.set.add(value);
    this.update();
    return this;
  }
}

export const visitedUrls = new Set<string>('./urls.json');
export const imageCache = new CacheMap<string, { hash?: string, size?: { width: number, height: number } | ISizeCalculationResult | false }>('./cache.json');