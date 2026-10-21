import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const root = path.dirname(fileURLToPath(import.meta.url));
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const jsonForHtml = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const slugify = (value) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const requiredString = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
  return value.trim();
};

export function normalizeArticles(data) {
  if (!Array.isArray(data)) throw new Error('articles.json must contain an array.');
  const slugs = new Set();
  return data.map((item, index) => {
    const label = `Article ${index + 1}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${label} must be an object.`);
    const article = { ...item };
    for (const field of ['title', 'summary', 'category', 'author', 'content', 'date']) article[field] = requiredString(item[field], `${label}.${field}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(article.date) || !Number.isFinite(Date.parse(`${article.date}T00:00:00Z`)) || new Date(`${article.date}T00:00:00Z`).toISOString().slice(0, 10) !== article.date) throw new Error(`${label}.date must be a valid YYYY-MM-DD date.`);
    if (!Array.isArray(item.tags) || item.tags.some((tag) => typeof tag !== 'string' || !tag.trim())) throw new Error(`${label}.tags must be an array of non-empty strings.`);
    article.tags = item.tags.map((tag) => tag.trim());
    if (item.seo !== undefined && typeof item.seo !== 'string') throw new Error(`${label}.seo must be a string of searchable keywords.`);
    article.seo = item.seo || '';
    article.slug = item.slug === undefined ? slugify(article.title) : requiredString(item.slug, `${label}.slug`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug)) throw new Error(`${label} needs a lowercase, hyphenated slug (set "slug" for non-Latin titles).`);
    if (slugs.has(article.slug)) throw new Error(`Duplicate article slug: ${article.slug}`);
    slugs.add(article.slug);
    article.url = `/articles/${article.slug}/`;
    article.readingMinutes = Math.max(1, Math.ceil(article.content.split(/\s+/).length / 200));
    return article;
  }).sort((a, b) => b.date.localeCompare(a.date));
}

export function validateSite(site) {
  for (const field of ['name', 'description', 'url', 'language', 'about']) requiredString(site[field], `site.${field}`);
  const url = new URL(site.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('site.url must be an HTTP(S) origin without a path, credentials, query, or fragment.');
  if (typeof site.email !== 'string' || (site.email && !/^[^\s@<>"?&#]+@[^\s@<>"?&#]+\.[^\s@<>"?&#]+$/.test(site.email))) throw new Error('site.email must be an email address or an empty string.');
  return { ...site, url: url.origin };
}

export function normalizeCategories(data, articles) {
  if (!Array.isArray(data)) throw new Error('category.json must contain an array of category names.');
  const categories = data.map((value, index) => requiredString(value, `Category ${index + 1}`));
  if (new Set(categories.map((category) => category.toLowerCase())).size !== categories.length) throw new Error('category.json contains duplicate category names.');
  for (const article of articles) {
    if (!categories.includes(article.category)) throw new Error(`Unknown category "${article.category}" for "${article.title}". Add it to category.json or update the article category.`);
  }
  return categories;
}

const dateLabel = (date) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const metaLine = (article) => `<span>${escapeHtml(article.author)}</span><span aria-hidden="true">&middot;</span><time datetime="${article.date}">${dateLabel(article.date)}</time><span aria-hidden="true">&middot;</span><span>${article.readingMinutes} min read</span>`;
const card = (article, index) => `<article class="article-card" data-article="${escapeHtml(article.slug)}">
  <a class="card-art art-${index % 4}" href="${article.url}" tabindex="-1" aria-hidden="true"><span class="art-orbit"></span><span class="art-sun"></span><span class="art-hill"></span><span class="art-label">${escapeHtml(article.category)}</span></a>
  <div class="card-body"><p class="eyebrow">${escapeHtml(article.category)}</p><h3><a href="${article.url}">${escapeHtml(article.title)}</a></h3><p class="card-summary">${escapeHtml(article.summary)}</p><div class="article-meta">${metaLine(article)}</div><div class="card-bottom"><div class="tags">${article.tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join('')}</div><a href="${article.url}" class="read-link" aria-label="Read more: ${escapeHtml(article.title)}">Read more <span aria-hidden="true">&#8599;</span></a></div></div>
</article>`;

export async function build(output = path.join(root, 'dist')) {
  const [rawArticles, rawSite, template, about, contact, script, rawCategories] = await Promise.all(
    ['articles.json', 'site.json', 'index.html', 'about.html', 'contact.html', 'main.js', 'category.json'].map((file) => readFile(path.join(root, file), 'utf8'))
  );
  const articles = normalizeArticles(JSON.parse(rawArticles));
  const site = validateSite(JSON.parse(rawSite));
  // Render only tokens in the trusted template, never tokens inside article content.
  const fill = (source, values) => source.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`Unknown template token: ${key}`);
    return values[key];
  });
  const page = ({ title, description = site.description, route = '/', content, keywords = '', article, section = '' }) => fill(template, {
    language: escapeHtml(site.language), title: escapeHtml(title), description: escapeHtml(description),
    keywords: escapeHtml(keywords), canonical: escapeHtml(site.url + route), siteName: escapeHtml(site.name),
    ogType: article ? 'article' : 'website', year: new Date().getFullYear(), content,
    journalCurrent: section === 'journal' ? 'aria-current="page"' : '',
    categoriesCurrent: section === 'categories' ? 'aria-current="page"' : '',
    aboutCurrent: section === 'about' ? 'aria-current="page"' : '',
    contactCurrent: section === 'contact' ? 'aria-current="page"' : '',
    articleMeta: article ? `<meta name="author" content="${escapeHtml(article.author)}"><meta property="article:published_time" content="${article.date}T00:00:00Z"><meta property="article:section" content="${escapeHtml(article.category)}">${article.tags.map((tag) => `<meta property="article:tag" content="${escapeHtml(tag)}">`).join('')}` : '',
    structuredData: jsonForHtml(article ? {
      '@context': 'https://schema.org', '@type': 'BlogPosting', headline: article.title,
      description, datePublished: article.date, author: { '@type': 'Person', name: article.author },
      mainEntityOfPage: site.url + route, url: site.url + route, keywords: [...article.tags, article.seo].filter(Boolean).join(', '),
      articleSection: article.category, articleBody: article.content, inLanguage: site.language,
      publisher: { '@type': 'Organization', name: site.name }
    } : {
      '@context': 'https://schema.org', '@type': route === '/' ? 'Blog' : route === '/categories.html' ? 'CollectionPage' : 'WebPage', name: title, description, url: site.url + route, inLanguage: site.language
    })
  });
  const categories = normalizeCategories(JSON.parse(rawCategories), articles);
  const home = `<section class="hero wrap">
    <div class="hero-visual"><img src="/images/journal-art.svg" alt="An illustrated green notebook with a landscape on its cover and a pencil" width="900" height="720"><span class="visual-caption">NOTES, THOUGHTS &amp; EVERYTHING IN BETWEEN</span></div>
    <div class="hero-copy"><p class="eyebrow"><span class="status-dot"></span> A JOURNAL FOR THE CURIOUS</p><h1>Ideas to explore.<br>Stories to <em>keep.</em></h1><p>${escapeHtml(site.description)}</p><a class="button" href="#journal">Explore the journal <span aria-hidden="true">&#8599;</span></a><div class="hero-footnote"><span class="small-spark" aria-hidden="true">&#10035;</span> New perspectives. At your own pace.</div></div>
  </section>
  <section class="journal wrap" id="journal" aria-labelledby="journal-heading">
    <div class="section-heading"><div><p class="eyebrow">THE LATEST CHAPTERS</p><h2 id="journal-heading">The journal<span class="heading-dot">.</span></h2></div><p>A collection of things worth a closer look.</p></div>
    <div class="journal-tools"><div class="filters" role="group" aria-label="Filter by category"><button type="button" class="filter active" data-category="" aria-pressed="true">All stories <span>${articles.length}</span></button>${categories.map((category) => `<button type="button" class="filter" data-category="${escapeHtml(category)}" aria-pressed="false">${escapeHtml(category)}</button>`).join('')}</div><form class="search" role="search"><label class="sr-only" for="article-search">Search articles, topics, or authors</label><span aria-hidden="true">&#9906;</span><input id="article-search" type="search" placeholder="Find something interesting..." autocomplete="off"><button type="submit" aria-label="Search articles">&#8594;</button></form></div>
    <div class="results-line"><p id="results-count" role="status" aria-live="polite">${articles.length} ${articles.length === 1 ? 'story' : 'stories'} to explore</p><span>THOUGHTFULLY WRITTEN. ALWAYS CURIOUS.</span></div>
    <div class="article-grid">${articles.map(card).join('')}</div>
    <div class="empty-state" id="empty-state" ${articles.length ? 'hidden' : ''}><span aria-hidden="true">&#10035;</span><h3>${articles.length ? 'No stories found' : 'A new chapter is on its way'}</h3><p>${articles.length ? 'Try another keyword or explore all stories.' : 'Check back soon for the first story.'}</p><button class="button" id="clear-search" type="button" ${articles.length ? '' : 'hidden'}>Clear filters</button></div>
    <noscript><p class="notice">All stories are shown. Enable JavaScript to search and filter the journal.</p></noscript>
  </section>
  <section class="closing-note wrap"><span aria-hidden="true">&#10035;</span><div><p class="eyebrow">STAY A LITTLE CURIOUS</p><h2>There's always another story.</h2><p>Come back for fresh ideas and a different point of view.</p></div><a href="/about.html">A little about this journal <span aria-hidden="true">&#8599;</span></a></section>`;

  const categoryPage = `<section class="category-intro wrap"><p class="eyebrow">FOLLOW YOUR CURIOSITY</p><h1>Explore by <em>category.</em></h1><p>From politics and health to technology and education, find your next great read.</p></section>
  <section class="category-layout wrap" aria-label="Browse articles by category">
    <aside class="category-sidebar"><h2>Categories</h2><div class="category-list" role="group" aria-label="Filter by category">
      <button type="button" class="filter active" data-category="" aria-pressed="true">All articles <span>${articles.length}</span></button>
      ${categories.map((category) => `<button type="button" class="filter" data-category="${escapeHtml(category)}" aria-pressed="false">${escapeHtml(category)} <span>${articles.filter((article) => article.category === category).length}</span></button>`).join('')}
    </div></aside>
    <div class="category-results"><h2 id="category-heading">All articles</h2>
      <form class="search" role="search"><label class="sr-only" for="article-search">Search articles, topics, or authors</label><input id="article-search" type="search" placeholder="Search within your selection..." autocomplete="off"><button type="submit" aria-label="Search articles">&#8594;</button></form>
      <div class="results-line"><p id="results-count" role="status" aria-live="polite">${articles.length} ${articles.length === 1 ? 'story' : 'stories'} to explore</p></div>
      <div class="article-grid">${articles.map(card).join('')}</div>
      <div class="empty-state" id="empty-state" ${articles.length ? 'hidden' : ''}><h3>No articles yet</h3><p>Try another category or search term, or come back soon for new articles.</p><button type="button" class="button" id="clear-search">Show all articles</button></div>
      <noscript><p class="notice">All articles are shown. Enable JavaScript to filter by category and search.</p></noscript>
    </div>
  </section>`;

  await mkdir(path.join(output, 'images'), { recursive: true });
  // This directory contains generated pages only; remove posts deleted from the source.
  await rm(path.join(output, 'articles'), { recursive: true, force: true });
  await writeFile(path.join(output, 'index.html'), page({ title: `${site.name} - Ideas, stories & discoveries`, content: home, section: 'journal', keywords: [...new Set(articles.flatMap((article) => [...article.tags, article.category, article.seo]))].filter(Boolean).join(', ') }));
  await writeFile(path.join(output, 'categories.html'), page({ title: `Categories | ${site.name}`, description: 'Browse articles by category, from politics and health to technology, education, and more. Search for topics and discover your next read.', route: '/categories.html', section: 'categories', content: categoryPage, keywords: categories.join(', ') }));
  await writeFile(path.join(output, 'about.html'), page({ title: `About | ${site.name}`, route: '/about.html', section: 'about', content: fill(about, { about: escapeHtml(site.about) }) }));
  await writeFile(path.join(output, 'contact.html'), page({ title: `Contact | ${site.name}`, route: '/contact.html', section: 'contact', content: fill(contact, { contactDetails: site.email ? `<a class="button" href="mailto:${escapeHtml(site.email)}">Say hello <span aria-hidden="true">&#8599;</span></a><p>${escapeHtml(site.email)}</p>` : '<p class="notice">Email contact is not available yet. In the meantime, explore the latest stories in the journal.</p><a class="button" href="/#journal">Back to the journal <span aria-hidden="true">&#8599;</span></a>' }) }));
  for (const article of articles) {
    const related = articles.filter((other) => other.slug !== article.slug).sort((a, b) => Number(b.category === article.category) - Number(a.category === article.category)).slice(0, 3);
    const content = `<article class="article-page wrap narrow"><a class="back-link" href="/#journal">&#8592; All stories</a><header><p class="eyebrow">${escapeHtml(article.category)}</p><h1>${escapeHtml(article.title)}</h1><p class="article-deck">${escapeHtml(article.summary)}</p><div class="article-meta">${metaLine(article)}</div></header><div class="article-content">${article.content.split(/\r?\n\s*\r?\n/).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\r?\n/g, '<br>')}</p>`).join('')}</div><footer class="article-end"><div class="tags">${article.tags.map((tag) => `<a href="/?q=${encodeURIComponent(tag)}#journal">#${escapeHtml(tag)}</a>`).join('')}</div><a href="/#journal">Back to the journal &#8599;</a></footer></article>${related.length ? `<section class="related wrap"><p class="eyebrow">KEEP EXPLORING</p><h2>Another good read.</h2><div class="article-grid">${related.map(card).join('')}</div></section>` : ''}`;
    const directory = path.join(output, 'articles', article.slug);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'index.html'), page({ title: `${article.title} | ${site.name}`, description: article.summary, route: article.url, content, article, keywords: [article.seo, article.category, ...article.tags].filter(Boolean).join(', ') }));
  }
  await writeFile(path.join(output, '404.html'), page({ title: `Page not found | ${site.name}`, content: '<section class="page-intro wrap narrow"><p class="eyebrow">404 - A LITTLE OFF THE PATH</p><h1>This page is<br><em>still unwritten.</em></h1><p class="page-description">The story you are looking for may have moved or no longer exists.</p><a class="button" href="/">Back to the journal &#8599;</a></section>' }));
  const entries = [{ route: '/' }, { route: '/categories.html' }, { route: '/about.html' }, { route: '/contact.html' }, ...articles.map((article) => ({ route: article.url, date: article.date }))];
  await writeFile(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(({ route, date }) => `  <url><loc>${escapeHtml(site.url + route)}</loc>${date ? `<lastmod>${date}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
  await writeFile(path.join(output, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`);
  const searchData = articles.map(({ slug, title, summary, category, author, tags, seo, content }) => ({ slug, title, summary, category, author, tags, seo, content }));
  await writeFile(path.join(output, 'main.js'), `const articles = ${jsonForHtml(searchData)};\n${script}`);
  await Promise.all(['style.css', 'images\\favicon.svg', 'images\\journal-art.svg'].map((file) => copyFile(path.join(root, file), path.join(output, file))));
  return { articles: articles.length, output };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await build();
  console.log(`Built ${result.articles} article(s), pages, search metadata, and sitemap in ${result.output}`);
}
