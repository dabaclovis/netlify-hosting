const searchInput = document.querySelector('#article-search');

if (searchInput) {
  const buttons = [...document.querySelectorAll('[data-category]')];
  const cards = [...document.querySelectorAll('[data-article]')];
  const count = document.querySelector('#results-count');
  const empty = document.querySelector('#empty-state');
  const clear = document.querySelector('#clear-search');
  const params = new URLSearchParams(location.search);
  let category = params.get('category') || '';
  if (!buttons.some((button) => button.dataset.category === category)) category = '';
  searchInput.value = params.get('q') || '';
  const normalize = (text) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const index = new Map(articles.map((article) => [article.slug, {
    category: article.category,
    text: normalize([article.title, article.summary, article.category, article.author, article.seo, ...article.tags, article.content].join(' '))
  }]));

  function filterArticles(updateUrl = true) {
    const query = searchInput.value.trim();
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const card of cards) {
      const article = index.get(card.dataset.article);
      const matches = (!category || article.category === category) && terms.every((term) => article.text.includes(term));
      card.hidden = !matches;
      if (matches) visible++;
    }
    for (const button of buttons) {
      const selected = button.dataset.category === category;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    count.textContent = `${visible} ${visible === 1 ? 'story' : 'stories'}${query || category ? ' found' : ' to explore'}`;
    const heading = document.querySelector('#category-heading');
    if (heading) heading.textContent = category || 'All articles';
    empty.hidden = visible !== 0;
    if (updateUrl) {
      const url = new URL(location.href);
      query ? url.searchParams.set('q', query) : url.searchParams.delete('q');
      category ? url.searchParams.set('category', category) : url.searchParams.delete('category');
      history.replaceState(null, '', url);
    }
  }

  searchInput.addEventListener('input', () => filterArticles());
  document.querySelector('.search').addEventListener('submit', (event) => {
    event.preventDefault();
    filterArticles();
  });
  buttons.forEach((button) => button.addEventListener('click', () => {
    category = button.dataset.category;
    filterArticles();
  }));
  clear.addEventListener('click', () => {
    category = '';
    searchInput.value = '';
    filterArticles();
    searchInput.focus();
  });
  filterArticles(false);
}