# Pangaea as a reference for New Drugs

This is a source review of `/Users/work/dev/pangaea`, alongside the [Wayfinder study](wayfinder-study/transfer.md). Pangaea has not been edited, started, restarted, deployed, or tested. Its source supplies interaction lessons; none of its code, UI, themes, or product rules are to be directly ported.

The UI observations below come from components and styles, not a claimed visual inspection of its live production site.

## What Pangaea is doing

Pangaea is a local social app with a Twitter-like content vocabulary: short posts, replies, profiles, follows, mutual friends, likes, reposts, saved items, and location-scoped feeds. Its original notes describe “Twitter for your county” or a county group chat. The current code adds several feed scopes, ranking modes, groups, media, and temporary views.

The relevant lesson for New Drugs is that the social world consists of recognizable people and content that can be directly inspected and acted on. An agent can help someone use that world, but it should not replace every useful interface with a paragraph of instructions.

## 1. Preserve a home while opening temporary views

[Main.jsx](/Users/work/dev/pangaea/frontend/src/screens/Main.jsx:1496) distinguishes a persistent main tab from `peek` and `ephemeral` views. [TabPane](/Users/work/dev/pangaea/frontend/src/screens/Main.jsx:421) can keep a view mounted while another is active. Navigation also records meaningful paths, and components use a small navigation context rather than rebuilding the shell themselves.

For New Drugs, **chat is the persistent home**. A request or user action can reveal a feed, person, post, profile editor, payment flow, or other relevant interface. Returning should restore the same conversation and pending task. A post detail opened from a feed can return to that feed; the chat remains available as the overall home.

The principle is continuity. Copying Pangaea's many persistent tabs, route parsing, or hidden-pane implementation would carry over complexity and assumptions this app does not need. New Drugs needs its own small, explicit surface state with an origin, return target, and lifecycle.

## 2. Give social records familiar, direct affordances

[PostsFeed](/Users/work/dev/pangaea/frontend/src/components/PostsFeed.jsx:1) renders real post records through a shared post component. [Post](/Users/work/dev/pangaea/frontend/src/components/Post.jsx:1) supports readable authorship, content, timestamps, replies, and action controls. Less-common actions live in a contextual menu. A profile is directly reachable from the content.

New Drugs should use recognizable content layouts when the user asks to browse. A person result should open that person's actual profile. A post result should open the actual post and its conversation. A like, reply, or other direct control should call the same canonical operation available to the agent. The UI should immediately reflect the result and handle failure coherently.

This does not require a permanent social dashboard on the initial screen. The first view remains the user's specified chat and orb. Native social views appear when useful or requested.

## 3. Content and controls carry the visual hierarchy

[App.css](/Users/work/dev/pangaea/frontend/src/App.css:1242) gives posts compact spacing, visible borders, ordinary typography, and a consistent action row. Theme values are centralized in CSS variables. [Icon.jsx](/Users/work/dev/pangaea/frontend/src/components/Icon.jsx:1) uses Phosphor icons. [AutoExpandTextarea](/Users/work/dev/pangaea/frontend/src/components/AutoExpandTextarea.jsx:1) measures its actual line height, padding, and borders instead of treating a textarea as decorative text.

The useful design direction is concrete and readable: clear input, obvious controls, and enough density to see the content. New Drugs already has its own specified Noto type system, colorful radial background, blue 3D orb, rounded outlined input, blue user bubbles, and dictation controls. Those decisions should be made consistent across all revealed surfaces.

Pangaea's decorative themes, branding, novelty controls, exact post styling, and layout dimensions are not instructions for New Drugs. Neither is its entire stylesheet architecture. The user's requirement here is extensive CSS variables and deliberate styling; the implementation should remain understandable as it grows.

## 4. Human composition has a proper interface

[Draft.jsx](/Users/work/dev/pangaea/frontend/src/screens/Draft.jsx:868) validates a composition, submits it, clears the successful draft, and navigates to the resulting post. Its writing surface includes the actual destination and relevant content choices. Mention selection resolves a textual name to a specific identity rather than silently guessing.

New Drugs should offer a useful native editing surface where human authorship matters. Profile text and images are the explicit example: the user sets them. Account creation should open that profile experience immediately. The agent can open the UI and continue from a verified save; the user should not have to narrate the completion back into chat.

The interaction lesson also applies when an action needs an exact recipient, audience, or text review. Show the relevant human decision directly. Do not turn a simple action into a generic settings scavenger hunt.

Pangaea's character limits, media integrations, poll controls, county-specific posting defaults, and exact destination options remain its own policies. They should not silently become restrictions in New Drugs.

## 5. Locality and relationships are distinct concepts

[FeedScreen.jsx](/Users/work/dev/pangaea/frontend/src/screens/FeedScreen.jsx:1) separates geographic scope, social scope, and sort order. Its friends feed means mutual follows, while follows and other social views have different meanings. [Profile.jsx](/Users/work/dev/pangaea/frontend/src/screens/Profile.jsx:805) shows relationship state as Follow, Following, Follow back, or Mutual.

This is useful for a product between Twitter and Bumble BFF: following someone, mutually connecting, accepting an invitation, receiving a message, and agreeing to a plan are different states. The agent and UI must name the state that actually exists. They must not call a person a friend merely because an invitation was sent.

New Drugs still needs its own deliberate relationship model. Pangaea's mutual-follow definition should not be copied automatically into a BFF-style connection flow, nor should both models be added without a reason.

Geographic scope should be explicit in the operation and view. A request about Providence is task context; it is not, by itself, permission to rewrite someone's public profile or a reason to invent a profile-completion gate. Pangaea's county identifiers, travel modes, and cross-area rules are reference implementations of location-aware behavior, not mandatory New Drugs rules.

## 6. Updates should respect the reader's position

[usePosts.js](/Users/work/dev/pangaea/frontend/src/hooks/usePosts.js:1) distinguishes initial load, older pages, and notification of newer posts. [NewPostsNotification](/Users/work/dev/pangaea/frontend/src/components/NewPostsNotification.jsx:1) lets the reader load new content instead of continually inserting it above their reading position. Likes update the local record and recover on failure.

For New Drugs, a feed and a conversation need different follow behavior. Chat can follow new output while the user is at the bottom. A browsed feed should keep the item being read stable and make new content available without constantly moving it. The same distinction should survive opening a post, inspecting a profile, and returning to chat.

The new implementation should derive pagination from a stable ordered cursor and reconcile optimistic records by identity. It should not directly copy timestamp-only cursors or assume that an in-memory toggle is an idempotent operation.

## 7. Stable identity, explicit visibility, and block enforcement

[User.js](/Users/work/dev/pangaea/backend/models/User.js:1) distinguishes permanent internal identity from a changeable username. [Post.js](/Users/work/dev/pangaea/backend/models/Post.js:1) has a public projection instead of returning its whole stored document. [Post routes](/Users/work/dev/pangaea/backend/routes/posts.js:1) account for group visibility, expiration, archives, and block relationships. The frontend also uses [blocking state](/Users/work/dev/pangaea/frontend/src/hooks/useBlocking.js:1) to present appropriate controls.

These are useful boundaries: identity should survive display-name or handle changes; private fields should not leak into a public projection; relationships and visibility must be enforced on the server even when a UI hides a control.

The exact token/authentication approach, username policy, group model, retention behavior, and ranking formula must be designed for New Drugs. Source review is not an endorsement that every reference implementation is suitable to copy.

## 8. Direct actions and agent actions must converge

Pangaea's interfaces are direct manipulation of social records. Wayfinder supplies the stronger cross-client operating contract and hosted-agent lifecycle. New Drugs should combine the lessons by giving both the person and their agent access to the same actual application capabilities, through the appropriate authority and confirmation boundary.

For example, a user can open a post and reply through a native control, or ask the agent to prepare the reply. Both paths must resolve the same post and recipient, preserve the same visibility rules, and produce the same durable message. The agent path adds orchestration and any necessary confirmation; it should not create a parallel social data model or pretend a narrative is an action.

## Source-derived guidance for the first New Drugs surfaces

| Surface | What it should let the person do | Return behavior |
| --- | --- | --- |
| Chat | Ask, dictate, review progress, approve exact actions, inspect results | Normal home |
| Profile creation/editing | Author their own identity and choose images | Save updates real state; resume the originating task when one exists |
| Person/profile view | Inspect actual public information and relationship state | Back to originating result/feed, with chat preserved |
| Posts/feed view | Browse real scoped content and open a post | Preserve scope and reading position; return to chat |
| Post/conversation view | Read context and take an explicit social action | Back to parent view or chat |
| Credits | Inspect balance and actual costs; complete a top-up | Verify completion from the ledger, then resume any waiting work |
| Upload request | Choose and verify the file needed for a task | Automatically continue the correct conversation |

These are interaction responsibilities, not an instruction to add every screen immediately or display them all in navigation. A feature should become visible when its underlying operation and full workflow are ready.
