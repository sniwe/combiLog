# dev-tunnel

Cloudflare quick-tunnel orchestration for combiLog local development.

- Starts `cloudflared tunnel --url http://localhost:PORT`
- Captures the dynamic `trycloudflare.com` URL
- Dev-only helper, not production tunnel config

Usage:

```js
const { startDevTunnel } = require('./dev-tunnel');

startDevTunnel({
  data: { localUrl: 'http://127.0.0.1:3000' },
  deps: {
    spawn,
    onUrl(ctx) {
      console.log(ctx.data.url);
    },
  },
});
```
