# Navigatr

A utility for scraping the nostr network. Please be considerate with your limits and filters, since this will open a connection to every relay it can find.

```javascript
export const nav = new Navigator({
  timeout: 10_000,
  relays: ['wss://relay.damus.io', 'wss://relay.snort.social'],
  filters: [{kinds: [1], limit: 10}],
})

nav.scrapeAll()
  .then(events => {
    nav.cleanup()

    console.log('done', n.events.size)
  })

```
