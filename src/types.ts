export interface Button {
  alts: string[];
  srcs: string[];
  hrefs: string[];
  timestamp: number;
  foundAt: string[];
  type: string | undefined
}

export interface Host {
  host: keyof ButtonDB['hosts'];
  metadata: SiteMetadata[];
  buttons: string[];
  urls: string[];
  paths: string[][];
}

export interface SiteMetadata {
  title?: string;
  keywords?: string[];
  description?: string;
}

export interface ButtonDB {
  hosts: Record<URL['host'], Host>,
  buttons: Record<string, Button>
}