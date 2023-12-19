import 'dotenv/config';
import {EventEmitter} from 'events';
import type {Filter, Event} from 'nostr-tools';
import {isShareableRelay, Pool, Relays, Executor} from 'paravel';

export type NavigatorOpts = {
  timeout: number;
  filters: Filter[];
  relays: string[];
};

export class Navigator extends EventEmitter {
  pool = new Pool();
  relays = new Set<string>();
  events = new Map<string, Event>();
  urlsScrapedForRelays = new Set<string>();
  urlsScrapedForEvents = new Set<string>();

  constructor(readonly opts: NavigatorOpts) {
    super();

    for (const url of opts.relays) {
      this.relays.add(url);
    }
  }

  getExecutor(urls: string[]) {
    return new Executor(
      new Relays(
        urls.map(url => {
          const connection = this.pool.get(url);

          connection.socket.ready.catch(() => null);

          return connection;
        })
      )
    );
  }

  getUrls() {
    return Array.from(this.relays);
  }

  getUrlsToScrapeForRelays() {
    return this.getUrls().filter(url => !this.urlsScrapedForRelays.has(url));
  }

  getUrlsToScrapeForEvents() {
    return this.getUrls().filter(url => !this.urlsScrapedForEvents.has(url));
  }

  load({
    urls,
    filters,
    onEvent,
  }: {
    urls: string[];
    filters: Filter[];
    onEvent: (url: string, e: Event) => void;
  }) {
    const {timeout} = this.opts;
    const executor = this.getExecutor(urls);

    return new Promise<void>(resolve => {
      executor.load(filters, {
        timeout,
        onEvent,
        onEose: url => {
          this.pool.get(url).socket.disconnect();
        },
        onClose: () => {
          executor.target.cleanup();
          this.disconnect();
          resolve();
        },
      });
    });
  }

  scrapeRelaysFromUrls(urls: string[]) {
    for (const url of urls) {
      this.urlsScrapedForRelays.add(url);
    }

    return this.load({
      urls,
      filters: [{kinds: [10002], limit: 100}],
      onEvent: (url: string, e: Event) => {
        for (const [t, url] of e.tags) {
          if (t === 'r' && isShareableRelay(url)) {
            this.relays.add(url);
          }
        }
      },
    });
  }

  scrapeEventsFromUrls(urls: string[]) {
    for (const url of urls) {
      this.urlsScrapedForEvents.add(url);
    }

    return this.load({
      urls,
      filters: this.opts.filters,
      onEvent: (url: string, e: Event) => {
        this.emit('event', url, e);
        this.events.set(e.id, e);
      },
    });
  }

  async scrapeAll({
    minRelays = Infinity,
    minEvents = Infinity,
    chunkSize = 10,
  } = {}) {
    while (this.relays.size < minRelays || this.events.size < minEvents) {
      const relayUrls = this.getUrlsToScrapeForRelays().slice(0, chunkSize);
      const eventUrls = this.getUrlsToScrapeForEvents().slice(0, chunkSize);

      if (eventUrls.length > 0) {
        console.log(`Scraping events from ${eventUrls.length} urls`);
        await this.scrapeEventsFromUrls(eventUrls);
      } else if (relayUrls.length > 0) {
        console.log(`Scraping relays from ${relayUrls.length} urls`);
        await this.scrapeRelaysFromUrls(relayUrls);
      } else {
        break;
      }
    }

    return Array.from(this.events.values());
  }

  disconnect() {
    for (const connection of this.pool.data.values()) {
      connection.socket.disconnect();
    }
  }

  cleanup() {
    this.pool.clear();
  }
}
