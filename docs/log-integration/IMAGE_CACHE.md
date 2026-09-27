# Local Log photo cache

`public/log-image-cache.js` implements a bounded IndexedDB cache behind the existing service worker. `src/logImageCache.ts` registers/binds it after the server identifies the current account and sends entry/file invalidations. Log photos use a `log-image=1` URL marker; ordinary app/API traffic, navigations, range requests, audio and video pass through unchanged. No offline app or API-response cache is introduced.

Limits:

- 32 MiB maximum, at most 384 photos, at most 2 MiB per photo.
- The byte budget also respects 10% of the origin quota and a share of currently available space.
- Least-recently-used eviction; untouched entries expire after 14 days.
- Separate metadata/blob stores avoid scanning image bytes to enforce limits.
- Serialized writes prevent concurrent loads from exceeding the budget. A quota error evicts older photos and retries once; denied/unavailable IndexedDB falls back to normal network images.

Cache keys include the account and file ID. Startup never clears the cache before account identity is known. Switching accounts or logging out purges it; a stale in-flight download cannot repopulate a cleared account. This is a cache of photos already returned by authorized Log operations, not a source of entry access. The app still obtains hangout data from the server.

Repeated image requests return cached bytes immediately. After a minute, the worker revalidates in the background. Authorization/deletion failures evict the photo and prompt Log to refresh. Successful Log reads/writes reconcile cached attachment IDs, and removing a file or leaving a hangout evicts its photos. File IDs are immutable and owned by one hangout. The same marked URLs work in the full-screen image viewer and neighbor preloads.

Validation: real browser IndexedDB stored a photo and served it again, including after reload, without a second network request. An isolated worker/database and fake image response were used; no account content was altered. That registration, database, files and test tab were removed. Tests cover LRU/bytes/count/age bounds, account isolation, logout races, staged-photo ownership, removed attachments, unavailable storage, and intercepted versus untouched requests.

The user also requested earlier calendar loading and mobile safe-area corrections. Older weeks preload one current scrollport height ahead (at least 360px), recalculated on resize. Browser panels reserve the bottom safe area outside the panel; standalone edge-to-edge panels reserve it internally, including Scan/Log and loading/error footer actions. Keyboard-open state removes the bottom inset. Standalone Log overlays use the main panel bounds to keep mode/settings controls accessible. Desktop/browser overlays retain their prior full-height behavior.

Live on dev `20260927112737233` and prod v0.21.3 (`20260927112944660`). Production script and HTML hashes match the release artifacts.
