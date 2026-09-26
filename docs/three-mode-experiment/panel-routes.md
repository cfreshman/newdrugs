# Primary panel URLs

The visible primary panel owns the URL. Its natural mode uses the existing short route. A different mode adds a prefix:

| Destination | Natural mode and path | Alternate context |
| --- | --- | --- |
| Chat | Agent, `/` | Secondary chat does not replace a social panel's URL |
| Feed | Posts, `/feed` | `/agent/feed` |
| Post | Posts, `/posts/:id` | `/friends/posts/:id` |
| People | Friends, `/nearby` | `/posts/nearby` |
| Person | Friends, `/people/:id` | `/posts/people/:id` |
| Messages | Friends, `/messages[/id]` | `/agent/messages/:id` |
| Inbox | Agent, `/inbox[/id]` | `/posts/inbox/:id` |
| Automations | Agent, `/automations[/id]` | `/friends/automations` |
| Chat search | Agent, `/chat-history` | `/posts/chat-history` |
| New post | Posts, `/compose` | `/agent/compose` |

`/agent`, `/friends`, and `/posts` are accepted home aliases. Reloading a bare link chooses its natural mode, independent of the last-used mode. Internal navigation retains the current mode unless a link explicitly names another one. Search text, scope, radius, coarse area, selected post IDs and chat author filter are query parameters. Settings overlays have temporary URLs and retain the panel underneath.

History writes are coalesced after React navigation settles. Back/Forward restores the mode, internal section, panel stack and filters without pushing another entry. Visited panel DOM is retained, bounded to 30 unreferenced entries per browser, so nearby history navigation preserves drafts and scroll. Neither a copied URL nor a reload includes unsent drafts or pagination state.

Panel title/empty-header clicks smoothly scroll their own content, including the inner DM transcript. Buttons, links, modified clicks and selected text retain their normal behavior. The document stays fixed; no iOS body-scroller proxy was added.

Reference: Pangaea's `frontend/src/screens/Main.jsx`, URL synchronization and tab destination/stack handling. Adapted to New Drugs' existing canonical resource links and independently preserved three-mode workspaces.
