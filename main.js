const searchInput = document.querySelector('#article-search');

if (searchInput) {
  const buttons = [...document.querySelectorAll('[data-category]')];
  const cards = [...document.querySelectorAll('[data-article]')];
  const count = document.querySelector('#results-count');
  const empty = document.querySelector('#empty-state');
  const clear = document.querySelector('#clear-search');
  const pagination = document.querySelector('#pagination');
  const params = new URLSearchParams(location.search);
  let category = params.get('category') || '';
  if (!buttons.some((button) => button.dataset.category === category)) category = '';
  searchInput.value = params.get('q') || '';
  const pageSize = 15;
  let currentPage = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);
  let matchingCards = [];
  const normalize = (text) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const index = new Map(articles.map((article) => [article.slug, {
    category: article.category,
    text: normalize([article.title, article.summary, article.category, article.author, article.seo, ...article.tags, article.content].join(' '))
  }]));

  function updateUrl() {
    const url = new URL(location.href);
    const query = searchInput.value.trim();
    query ? url.searchParams.set('q', query) : url.searchParams.delete('q');
    category ? url.searchParams.set('category', category) : url.searchParams.delete('category');
    currentPage > 1 ? url.searchParams.set('page', String(currentPage)) : url.searchParams.delete('page');
    history.replaceState(null, '', url);
  }

  function renderPagination(pageCount) {
    pagination.replaceChildren();
    pagination.hidden = pageCount <= 1;
    if (pagination.hidden) return;

    function addButton(label, page, ariaLabel, current = false) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pagination-button';
      button.textContent = label;
      button.setAttribute('aria-label', ariaLabel);
      if (current) button.setAttribute('aria-current', 'page');
      button.disabled = page < 1 || page > pageCount;
      button.addEventListener('click', () => {
        if (button.disabled) return;
        currentPage = page;
        renderPage();
        updateUrl();
        document.querySelector('#journal-heading').scrollIntoView({ block: 'start' });
      });
      pagination.append(button);
    }

    function addEllipsis() {
      const ellipsis = document.createElement('span');
      ellipsis.className = 'pagination-ellipsis';
      ellipsis.setAttribute('aria-hidden', 'true');
      ellipsis.textContent = '...';
      pagination.append(ellipsis);
    }

    addButton('Previous', currentPage - 1, 'Previous page');
    const pages = pageCount <= 7
      ? Array.from({ length: pageCount }, (_, index) => index + 1)
      : [...new Set([1, currentPage - 1, currentPage, currentPage + 1, pageCount])].sort((a, b) => a - b);
    let previousPage = 0;
    for (const page of pages) {
      if (page - previousPage > 1) addEllipsis();
      addButton(String(page), page, `Page ${page}`, page === currentPage);
      previousPage = page;
    }
    addButton('Next', currentPage + 1, 'Next page');
  }

  function renderPage() {
    const pageCount = Math.ceil(matchingCards.length / pageSize);
    currentPage = Math.min(Math.max(currentPage, 1), Math.max(pageCount, 1));
    const visibleCards = new Set(matchingCards.slice((currentPage - 1) * pageSize, currentPage * pageSize));
    for (const card of cards) card.hidden = !visibleCards.has(card);
    renderPagination(pageCount);
  }

  function filterArticles(syncUrl = true, resetPage = true) {
    const query = searchInput.value.trim();
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    matchingCards = [];
    for (const card of cards) {
      const article = index.get(card.dataset.article);
      const matches = (!category || article.category === category) && terms.every((term) => article.text.includes(term));
      if (matches) matchingCards.push(card);
    }
    if (resetPage) currentPage = 1;
    renderPage();
    for (const button of buttons) {
      const selected = button.dataset.category === category;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    const visible = matchingCards.length;
    count.textContent = `${visible} ${visible === 1 ? 'story' : 'stories'}${query || category ? ' found' : ' to explore'}`;
    const heading = document.querySelector('#category-heading');
    if (heading) heading.textContent = category || 'All articles';
    empty.hidden = visible !== 0;
    if (syncUrl) updateUrl();
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
  window.addEventListener('popstate', () => {
    const urlParams = new URLSearchParams(location.search);
    const selectedCategory = urlParams.get('category') || '';
    category = buttons.some((button) => button.dataset.category === selectedCategory) ? selectedCategory : '';
    searchInput.value = urlParams.get('q') || '';
    currentPage = Math.max(1, Number.parseInt(urlParams.get('page'), 10) || 1);
    filterArticles(false, false);
  });
  filterArticles(false, false);
}