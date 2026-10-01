# Frontend

React + TypeScript with Vite, Lucide icons and custom responsive CSS. Read **`../backend/README.md`** for installation, login, permissions and deployment.

```sh
npm ci
npm run dev
npm run build
```

The backend must be running for all real data. The Vite development server proxies `/api` to the backend port configured in the root `.env`. The frontend does not contain database credentials or authoritative role decisions. Production assets are served by the Node backend after `npm run build`.

Only variables with Vite's explicit public prefix would be exposed to client code. The project reads the Google client ID (a public OAuth identifier) from `/api/public`, and never exposes the initial admin password.

This is a new design, with no copied application source from the old ZIP. Images are licensed, illustrative stock photos, not verified Beawar listings. See `../backend/README.md` for the complete dashboard, map, services, booking ledger, news-feed and permission notes.
