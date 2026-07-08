# Bell Diagnostic Coach

A mobile-first web app that guides Bell Bros. technicians through a residential
no-cool diagnostic, does the common HVAC math, and generates a clean job summary
to paste into ServiceTitan. It installs to an iPhone Home Screen and works offline.

## Files (all live in the repo root)

- `index.html` — the app's structure and all 10 sections
- `styles.css` — styling
- `app.js` — all the logic (navigation, calculators, guidance, summary)
- `pt-data.js` — pressure/temperature lookup tables for each refrigerant
- `sw.js` — service worker (makes the app work offline)
- `manifest.webmanifest` — lets the app install to the Home Screen
- `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon-32.png` — app icons

## Updating the app (important)

The app caches its own files so it runs without signal. Whenever you change ANY
file, open `sw.js` and bump the version number by one, e.g.:

    const CACHE_VERSION = "bdc-v4";   ->   "bdc-v5"

If you don't bump it, phones will keep showing the old cached version.

After uploading changes, refresh: on a computer press Ctrl+Shift+R (Cmd+Shift+R on
Mac); on an iPhone, fully close and reopen the Home Screen app.

## PT chart data

The saturation temperatures come from `pt-data.js`. These are reference values
compiled from published manufacturer charts — verify against the equipment data
plate before using them to charge a system. To update a refrigerant, replace its
`points` array using the format `[psig, bubbleTempF, dewTempF]`, sorted by psig.

## Scope

Version one covers residential no-cool calls only. It's a coaching and
documentation aid — it never declares a system "fixed" or a charge "correct."
