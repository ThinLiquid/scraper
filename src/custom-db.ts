import { Database } from "bun:sqlite";
import { Button, ButtonDB, Host } from "./types";

export class CustomDB {
  db: Database;

  constructor(path: string, readonly = false) {
    this.db = new Database(path, readonly == true ? { readonly } : undefined);
    this.db.run("PRAGMA journal_mode=WAL;");

    this.db.run(`
      CREATE TABLE IF NOT EXISTS buttons (
        hash TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS hosts (
        host TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  async getButton(hash: string): Promise<Button | null> {
    const row = this.db.query("SELECT value FROM buttons WHERE hash = ?").get(hash);
    if (row) {
      return JSON.parse(row.value) as Button;
    }
    return null;
  }

  async updateButton(
    hash: string,
    updateFn: (button: Button | null) => Button | null | Promise<Button | null>
  ) {
    const currentButton = await this.getButton(hash);
    const updatedButton = await updateFn(currentButton);
    if (updatedButton == null) return
    const value = JSON.stringify(updatedButton);

    this.db.run("INSERT OR REPLACE INTO buttons (hash, value) VALUES (?, ?)", hash, value);
    return updatedButton
  }

  async getHost(host: string): Promise<Host | null> {
    const row = this.db.query("SELECT value FROM hosts WHERE host = ?").get(host);
    if (row) {
      return JSON.parse(row.value) as Host;
    }
    return null;
  }

  async updateHost(
    host: string,
    updateFn: (host: Host | null) => Host | null | Promise<Host | null>
  ) {
    const currentHost = await this.getHost(host);
    const updatedHost = await updateFn(currentHost);
    if (updatedHost == null) return
    const value = JSON.stringify(updatedHost);
    this.db.run("INSERT OR REPLACE INTO hosts (host, value) VALUES (?, ?)", host, value);
    return updatedHost
  }

  async getAll(): Promise<ButtonDB> {
    const buttons: Record<string, Button> = {};
    const hosts: Record<string, Host> = {};

    for (const { hash, value } of this.db.query("SELECT hash, value FROM buttons").all()) {
      buttons[hash] = JSON.parse(value) as Button;
    }

    for (const { host, value } of this.db.query("SELECT host, value FROM hosts").all()) {
      hosts[host] = JSON.parse(value) as Host;
    }

    return { buttons, hosts };
  }
}
