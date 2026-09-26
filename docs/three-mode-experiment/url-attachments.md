# URL attachments and custom media

Posts and replies accept up to three separately stored URL attachments. They do not use the caption’s 280-character budget. Link-only posts are supported. UI, CLI/MCP, returned post lists and exact agent reviews share these fields. The composer shows the author, attached URLs, media previews and the photo/URL toolbar.

The implementation was adapted from Pangaea’s Draft LinkEditor, LinkPreview, audioEmbeds, MusePlayer, PopsPreview and CifPlayer. Its reference app was only read.

Recognized players: Spotify, SoundCloud, Bandcamp, Apple Music, YouTube and Vimeo. Ordinary websites retain metadata cards; direct raster URLs get image previews. Known player URLs are constructed from provider resource IDs. Pasted HTML is not executed. Cached website and manifest fetches use the existing bounded public-address/DNS/redirect boundary.

Custom documents:
- MUSE: title, artist, album, artwork, audio, outgoing source links, distributable hint and preferred layouts including slim, square and portrait.
- CIF: single/multiple cards, image/video/audio, MUSE audio references, captions, artist/location labels, metadata and image tags. Card arrows and horizontal swipes work; artwork opens the app viewer.
- POPS: article title, font/size/alignment, text/image/video/audio/link/textlink blocks, page audio and an expanded reader. Nested previews are bounded; linked plaintext uses the read-only links.text operation.

Custom content is rendered as validated data, never arbitrary HTML. Media pauses when its surface is hidden. No server-hosted social content or real public test posts were created during validation; posting tests used the isolated cloud test database.

Verified the live dev API with the MUSE example referenced by the CIF builder, including its audio and artwork. Checked native previews, CIF navigation and POPS expansion at phone width. Third-party playback remains subject to provider/browser restrictions and always retains an outbound source link.
