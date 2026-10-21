import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, normalizeArticles, normalizeCategories, validateSite, escapeHtml } from './build.js';

const sample = { title: 'A thoughtful story', summary: 'An introduction', category: 'Ideas', author: 'Writer', tags: ['thoughts'], seo: 'perspective', content: 'First paragraph.\n\nSecond paragraph.', date: '2026-10-21' };

test('normalizes the existing schema, stable slugs, reading time and newest-first order', () => {
  const articles = normalizeArticles([{ ...sample, date: '2024-06-10' }, { ...sample, title: 'Caf\u00e9 ideas', slug: 'stable-url', content: 'word '.repeat(401) }]);
  assert.equal(articles[0].slug, 'stable-url');
  assert.equal(articles[0].url, '/articles/stable-url/');
  assert.equal(articles[0].readingMinutes, 3);
  assert.equal(articles[1].url, '/articles/a-thoughtful-story/');
  assert.equal(normalizeArticles([{ ...sample, title: 'Caf\u00e9 ideas' }])[0].slug, 'cafe-ideas');
  assert.deepEqual(normalizeArticles([]), []);
});

test('rejects invalid records, dates, paths and duplicate URLs', () => {
  for (const data of [{}, [null], [{ ...sample, date: '2026-02-30' }], [{ ...sample, tags: 'ideas' }], [{ ...sample, content: '' }], [{ ...sample, seo: {} }], [{ ...sample, slug: '../escape' }], [sample, sample]]) {
    assert.throws(() => normalizeArticles(data));
  }
});

test('validates origin configuration and escapes untrusted HTML', () => {
  const site = { name: 'Journal', description: 'Stories', url: 'https://example.com/', language: 'en', about: 'About', email: '' };
  assert.equal(validateSite(site).url, 'https://example.com');
  for (const url of ['javascript:alert(1)', 'https://example.com/blog/', 'https://example.com/?query=1', 'https://user:pass@example.com']) {
    assert.throws(() => validateSite({ ...site, url }));
  }
  assert.throws(() => validateSite({ ...site, email: 'bad?email@example.com' }));
  assert.equal(escapeHtml('<script>"a"&\'</script>'), '&lt;script&gt;&quot;a&quot;&amp;&#39;&lt;/script&gt;');
});

test('uses configured category order and validates category membership', () => {
  assert.deepEqual(normalizeCategories(['Politics', 'Health', 'Ideas'], [sample]), ['Politics', 'Health', 'Ideas']);
  assert.deepEqual(normalizeCategories([], []), []);
  for (const categories of [{}, [''], ['Ideas', 'ideas'], ['Health']]) {
    assert.throws(() => normalizeCategories(categories, [sample]));
  }
});

test('builds crawlable article pages, matching sitemap, metadata and local search index', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'fieldnotes-test-'));
  try {
    const result = await build(output);
    const [home, sitemap, robots, script] = await Promise.all(['index.html', 'sitemap.xml', 'robots.txt', 'main.js'].map((file) => readFile(path.join(output, file), 'utf8')));
    const raw = JSON.parse(await readFile(new URL('./articles.json', import.meta.url), 'utf8'));
    const articles = normalizeArticles(raw);
    const site = validateSite(JSON.parse(await readFile(new URL('./site.json', import.meta.url), 'utf8')));
    assert.equal(result.articles, articles.length);
    assert.match(home, /role="search"/);
    assert.match(home, /aria-live="polite"/);
    assert.match(home, /<img class="brand-icon" src="\/images\/favicon\.svg" alt="" width="40" height="40">/);
    const logo = await readFile(path.join(output, 'images', 'favicon.svg'), 'utf8');
    assert.match(logo, /viewBox="0 0 64 64"/);
    assert.ok(!logo.includes('<text'));
    assert.ok(home.indexOf('class="hero-visual"') < home.indexOf('class="hero-copy"'));
    assert.ok(robots.includes(`${site.url}/sitemap.xml`));
    assert.equal((sitemap.match(/<url>/g) || []).length, articles.length + 4);
    const categoryPage = await readFile(path.join(output, 'categories.html'), 'utf8');
    const categories = normalizeCategories(JSON.parse(await readFile(new URL('./category.json', import.meta.url), 'utf8')), articles);
    for (const category of categories) {
      const count = articles.filter((article) => article.category === category).length;
      assert.ok(categoryPage.includes(`data-category="${escapeHtml(category)}" aria-pressed="false">${escapeHtml(category)} <span>${count}</span>`));
    }
    assert.ok(categoryPage.includes(`href="${site.url}/categories.html"`));
    assert.ok(sitemap.includes(`${site.url}/categories.html`));
    assert.match(categoryPage, /"@type":"CollectionPage"/);
    assert.ok(home.includes('href="/categories.html"'));
    assert.ok(!home.includes('{{'));
    for (const article of articles) {
      const html = await readFile(path.join(output, 'articles', article.slug, 'index.html'), 'utf8');
      assert.ok(home.includes(`href="${article.url}"`));
      assert.ok(home.includes(`<a href="${article.url}" class="read-link" aria-label="Read more: ${escapeHtml(article.title)}">Read more <span aria-hidden="true">&#8599;</span></a>`));
      assert.ok(sitemap.includes(`<loc>${escapeHtml(site.url + article.url)}</loc><lastmod>${article.date}</lastmod>`));
      assert.ok(html.includes(`<link rel="canonical" href="${escapeHtml(site.url + article.url)}">`));
      assert.ok(html.includes(escapeHtml(article.content.split(/\r?\n/)[0])));
      assert.ok(html.includes(escapeHtml(article.summary)));
      const jsonLd = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
      assert.equal(jsonLd['@type'], 'BlogPosting');
      assert.equal(jsonLd.headline, article.title);
      assert.equal(jsonLd.mainEntityOfPage, site.url + article.url);
      assert.ok(script.includes(JSON.stringify(article.slug)));
    }
    for (const file of ['categories.html', 'about.html', 'contact.html', '404.html']) {
      assert.ok(!(await readFile(path.join(output, file), 'utf8')).includes('{{'));
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
