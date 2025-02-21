import { Database } from "bun:sqlite";
import { Button, ButtonDB, Host } from "./types";

export class CustomDB {
  db: Database;

  constructor(path: string, readonly = false) {
    // Open (or create) the SQLite database at the given path.
    this.db = new Database(path, readonly == true ? { readonly } : undefined);
    this.db.run("PRAGMA journal_mode=WAL;");

    // Create tables for buttons and hosts if they don't already exist.
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
    // Query for the button with the given hash.
    const row = this.db.query("SELECT value FROM buttons WHERE hash = ?").get(hash);
    if (row) {
      // Parse and return the JSON object.
      return JSON.parse(row.value) as Button;
    }
    return null;
  }

  async updateButton(
    hash: string,
    updateFn: (button: Button | null) => Button | Promise<Button>
  ) {
    const currentButton = await this.getButton(hash);
    const updatedButton = await updateFn(currentButton);
    const value = JSON.stringify(updatedButton);
    // Use "INSERT OR REPLACE" to update or create the record.
    this.db.run("INSERT OR REPLACE INTO buttons (hash, value) VALUES (?, ?)", hash, value);
    return updatedButton
  }

  async getHost(host: string): Promise<Host | null> {
    // Query for the host with the given key.
    const row = this.db.query("SELECT value FROM hosts WHERE host = ?").get(host);
    if (row) {
      return JSON.parse(row.value) as Host;
    }
    return null;
  }

  async updateHost(
    host: string,
    updateFn: (host: Host | null) => Host | Promise<Host>
  ) {
    const currentHost = await this.getHost(host);
    const updatedHost = await updateFn(currentHost);
    const value = JSON.stringify(updatedHost);
    this.db.run("INSERT OR REPLACE INTO hosts (host, value) VALUES (?, ?)", host, value);
    return updatedHost
  }

  async getAll(): Promise<ButtonDB> {
    const buttons: Record<string, Button> = {};
    const hosts: Record<string, Host> = {};

    // Get all buttons.
    for (const { hash, value } of this.db.query("SELECT hash, value FROM buttons").all()) {
      buttons[hash] = JSON.parse(value) as Button;
    }

    // Get all hosts.
    for (const { host, value } of this.db.query("SELECT host, value FROM hosts").all()) {
      hosts[host] = JSON.parse(value) as Host;
    }

    return { buttons, hosts };
  }
}
