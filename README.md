# Stark

A minimal Hugo blog theme with practical enhancements. Based on [hugo-bearblog](https://github.com/janraasch/hugo-bearblog).

## Features

- Table of Contents — sidebar on wide screens, floating button + modal on narrow screens
- Full-text search — client-side, no external service, triggered via `Ctrl/Cmd+K`
- Mermaid diagrams — click to zoom with pan and scroll-wheel scaling
- Image lightbox — click any post image to preview with zoom controls
- Code copy button — hovers over each code block
- Back to top button
- Enhanced SEO — Open Graph, Twitter Card, structured data (schema.org)
- Auto image optimization — local images resized and converted to WebP
- RSS with author metadata
- Custom sitemap
- Dark mode support
- Year-grouped post list with pinned posts support
- Related posts by tag
- Word count and reading time on single posts

## Installation

```bash
git submodule add https://github.com/jimyag/stark.git themes/stark
```

Then set `theme = "stark"` in your `hugo.toml`.

## Configuration

See [`exampleSite/hugo.toml`](exampleSite/hugo.toml) for a full example.

Key params under `[params]`:

| Key | Description |
|-----|-------------|
| `description` | Site description used in meta tags |
| `favicon` | Path to favicon image |
| `dateFormat` | Go date format string, default `"02 Jan, 2006"` |
| `hideMadeWithLine` | Set `true` to hide the footer credit line |
| `ogLocale` | Open Graph locale, default `"en_US"` |
| `author.name` | Author name for RSS and structured data |
| `author.email` | Author email for RSS |
| `social.github` | GitHub username for schema.org Person |
| `social.stackoverflow` | Full Stack Overflow profile URL |
| `social.twitter` | Twitter handle for schema.org Person |

### Search

Search requires a JSON output for the home page. Add this to your `hugo.toml`:

```toml
[outputs]
  home = ["HTML", "RSS", "JSON"]
```

### Pinned posts

Add `pinned: true` to a post's front matter to pin it to the top of the list. Use `weight` to control ordering among pinned posts.

### Mermaid

Use a fenced code block with the `mermaid` language identifier:

    ```mermaid
    graph TD
        A --> B
    ```

### Markup options

Recommended `[markup]` settings:

```toml
[markup]
  [markup.highlight]
    lineNos = true
    lineNumbersInTable = true
    style = "monokai"
  [markup.tableOfContents]
    startLevel = 2
    endLevel = 4
```

## Credits

- [hugo-bearblog](https://github.com/janraasch/hugo-bearblog) by Jan Raasch (MIT)
- [Bear Blog](https://bearblog.dev) by Herman Martinus

## License

MIT
