# Articles

A responsive, dependency-free blog generated from [articles.json](articles.json). Requires Node.js 20 or newer.

## Run locally

```sh
npm start
```

Open http://localhost:3000. Startup builds the site; restart after editing articles, configuration, or source files. No dependency installation is needed. Set the `PORT` environment variable to change the local port.

### VS Code Live Server

Run `npm run build` first, then start Live Server. The workspace setting in [.vscode/settings.json](.vscode/settings.json) serves `dist` as the web root, so homepage links, assets, and slug-based article pages resolve correctly.

If Live Server was already running, stop it and start it again to apply the root setting, then open http://127.0.0.1:5500/ (or the port it reports). Rebuild after changing source files or articles.

The root `index.html` is a build template, not a directly viewable page. Literal text such as `{{siteName}}` or `{{content}}` means the source template is being served instead of the generated site. Do not use `/dist/` as a URL prefix: the generated pages use domain-root asset and article links.

## Publish

1. Update [site.json](site.json): set `name`, `description`, `about`, `language`, and especially `url` to your real HTTPS domain (origin only, no subdirectory). Set `email` to enable the contact email link, or leave it empty to show an honest unavailable message.
2. Run `npm run build`.
3. Deploy the **contents** of the generated `dist` directory to any static host. Enable directory index pages and use `404.html` as the not-found page. This site expects deployment at the domain root.
4. Submit `https://your-domain.com/sitemap.xml` to your search engine's webmaster tools.

Rebuild and redeploy whenever articles change. Production hosting should serve HTTPS. The bundled server is for local previews and binds only to your own computer.

### Netlify deployment from GitHub

Prepared target: [dabaclovis/netlify-hosting](https://github.com/dabaclovis/netlify-hosting), production branch **master**, domain **https://articles.brotherfall.com**.

1. Put this project's source files at the repository root on `master`. Upload/commit all required source files, including `articles.json`, `category.json`, `site.json`, templates, images, JavaScript, package metadata, tests, agent files, and `netlify.toml`. Do not commit `dist`, credentials, or dependencies. This preparation does not initialize Git or push anything.
2. In Netlify, import an existing project from GitHub, grant access to that repository, and select `master` as the production branch. Leave the base directory at the repository root.
3. [netlify.toml](netlify.toml) specifies Node.js 22, build command `npm test && npm run build`, and publish directory `dist`. Netlify serves the generated static site; do not run `server.js` in production. The build copies image assets using platform-native paths so it works on Netlify's Linux runners.
4. Add `articles.brotherfall.com` in Netlify's domain settings. Follow Netlify's displayed DNS instructions at your DNS provider and wait for HTTPS provisioning. `site.json` already uses this HTTPS domain for canonical URLs, structured data, robots, and sitemap.
5. Enable automatic production builds for pushes to `master`. Test the first deployment, `/categories.html`, an article URL such as `/articles/sample-article/`, `/sitemap.xml`, and an unknown URL (which should return the custom 404).
6. Once connected, each successful article push triggers Netlify to test, build, and publish the updated articles and sitemap. Failed builds do not publish the new article; inspect Netlify's deploy logs.

For agent publishing, separately configure this local folder as the repository checkout, authenticate Git, set `origin` to the exact repository above, and check out `master`. Begin from a clean checkout synchronized with `origin/master`. Initial repository setup and first push are manual prerequisites, not actions performed by the article agent.

## Add articles

Keep [articles.json](articles.json) as a JSON array. The existing sample is preserved. Each article uses:

```json
{
  "title": "A fresh perspective",
  "slug": "a-fresh-perspective",
  "summary": "A short description used on cards and in search-engine previews.",
  "tags": ["ideas", "creativity"],
  "category": "Discoveries",
  "seo": "creative thinking, new perspectives",
  "author": "Your Name",
  "content": "The first paragraph.\n\nThe next paragraph.",
  "date": "2026-10-21"
}
```

All fields except `slug` and `seo` are required; `tags` may be an empty array. `seo` is a searchable keywords string, compatible with the original article format. Dates must be real calendar dates in `YYYY-MM-DD` format. Articles appear newest first; future-dated posts are also published immediately.

`slug` is optional and otherwise derived from the title. Use a unique lowercase, hyphenated slug, particularly for non-Latin titles. Set explicit slugs to keep URLs stable when changing titles. Duplicate slugs and invalid records fail the build with a descriptive error.

The homepage and related-story previews display artwork on the left and article text on the right, stacking on small screens. Each preview shows the summary and a **Read more** link to the full article at `/articles/<slug>/` (for example, `/articles/a-fresh-perspective/`). Article titles and artwork link to the same page. The hero illustration also appears to the left of its text on desktop.

Content is **plain text**, not HTML or Markdown. Blank lines separate paragraphs; single newlines create line breaks. HTML is escaped for safety. There are no external fonts, analytics, images, or runtime services.

## Search and SEO

- [category.json](category.json) is the category source of truth: a JSON array of unique names, displayed in file order. The Categories page at `/categories.html` shows each category's total article count, including zero-count categories, with combined category/search filters and shareable URLs. Names must match article categories exactly; unknown article categories fail the build. The sample category is retained for the existing sample article and can be removed once that article is recategorized or removed.

- Live, accent-insensitive search covers title, summary, category, tags, author, `seo`, and full article content. All words must match; category filters combine with search.
- Search/filter state is shareable in the URL (`?q=ideas&category=Discoveries`).
- Every article has a pre-rendered, directly accessible URL under `/articles/<slug>/`; content and links work without JavaScript.
- Pages include title/description, canonical URLs, keyword metadata, Open Graph and Twitter tags. Articles include author, publication date, tags, and `BlogPosting` JSON-LD.
- `sitemap.xml` includes all articles and main pages. `robots.txt` advertises it. Meta keywords are included for compatibility, but modern search engines primarily use the visible content, descriptions, and structured data; indexing is not guaranteed.
- The browser search index is bundled locally into generated JavaScript; no API or database is required. All published article content is public.
- [about.html](about.html) and [contact.html](contact.html) are content templates; [index.html](index.html) is the shared page shell. Generated files in `dist` should not be manually edited.

## Validate

```sh
npm test
npm run build
```

## Article-writing agent

The [Article Writer policy](article.agent.md) defines original, source-verified, SEO-friendly writing in any suitable category, using the author name `knowledge blog`. The [VS Code discovery file](.github/agents/article.agent.md) makes it available as **Article Writer** in the chat agent picker.

Select the agent and ask it to follow the daily editorial and authorized GitHub publishing workflows. It targets **three articles together per day in one 06:30 AM local-time run**. It counts today's existing articles by `knowledge blog`, creates only the missing number to reach three, and skips when the target is met. Each article has a distinct topic and independently verified sources. It checks repository prerequisites, preserves existing articles, saves the batch together, runs `npm test` then `npm run build`, verifies all generated pages, and commits/pushes only `articles.json` once to the configured `master` branch. The root policy permits this scoped future publishing; no push is performed by preparing these files. A successful push triggers deployment only after Netlify is connected, and is not proof the articles are live.

The policy includes Windows Task Scheduler instructions for a proposed daily **06:30 AM local-time** run. **No automatic job is installed or enabled.** Unattended operation requires a separately authenticated, tested AI CLI with web access and appropriate permissions; the agent file itself is not a scheduler. Confirm the desired timezone and frequency before enabling a real task.
