(function() {
  const i18n = window.StarkI18n || {};
  const config = window.StarkConfig || {};

  function initReadingProgress() {
    const bar = document.createElement('div');
    bar.id = 'reading-progress';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', '0');
    bar.setAttribute('aria-label', i18n.readingProgressAria || 'Reading progress');
    document.body.appendChild(bar);

    function update() {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? Math.min(100, Math.round(scrollTop / docHeight * 100)) : 0;
      bar.style.width = `${pct}%`;
      bar.setAttribute('aria-valuenow', pct);
    }

    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  function initThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;

    function getTheme() {
      return document.documentElement.getAttribute('data-theme') || 'light';
    }

    function applyTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      btn.textContent = theme === 'dark' ? '☀' : '☾';
      btn.setAttribute('aria-label', theme === 'dark' ? i18n.themeLight : i18n.themeDark);
      document.dispatchEvent(new CustomEvent('stark:theme-change', { detail: { theme } }));
    }

    applyTheme(getTheme());

    btn.addEventListener('click', function() {
      const next = getTheme() === 'dark' ? 'light' : 'dark';
      localStorage.setItem('stark-theme', next);
      applyTheme(next);
    });

    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(event) {
        if (!localStorage.getItem('stark-theme')) {
          applyTheme(event.matches ? 'dark' : 'light');
        }
      });
    }
  }

  function initCodeCopy() {
    async function writeText(text) {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
      }

      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();

      try {
        if (!document.execCommand('copy')) {
          throw new Error('copy failed');
        }
      } finally {
        document.body.removeChild(textarea);
      }
    }

    function showCopyState(btn, ok, defaultText) {
      btn.textContent = ok ? i18n.copied : i18n.copyFailed;
      btn.classList.toggle('copied', ok);
      setTimeout(() => {
        btn.textContent = defaultText;
        btn.classList.remove('copied');
      }, 2000);
    }

    document.querySelectorAll('.highlight').forEach(block => {
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = i18n.copy || 'Copy';
      btn.setAttribute('aria-label', i18n.copyCode || i18n.copy || 'Copy code');

      btn.addEventListener('click', async () => {
        const codeEl = block.querySelector('td:last-child code') || block.querySelector('code');
        if (!codeEl) return;

        try {
          await writeText(codeEl.textContent);
          showCopyState(btn, true, i18n.copy || 'Copy');
        } catch (err) {
          showCopyState(btn, false, i18n.copy || 'Copy');
        }
      });

      block.style.position = 'relative';
      block.appendChild(btn);
    });
  }

  function initBackToTop() {
    const btn = document.createElement('button');
    btn.id = 'back-to-top';
    btn.type = 'button';
    btn.textContent = i18n.backToTop || 'Top';
    btn.setAttribute('aria-label', i18n.backToTopAria || 'Back to top');
    btn.setAttribute('title', i18n.backToTopAria || 'Back to top');
    document.body.appendChild(btn);

    window.addEventListener('scroll', () => {
      btn.classList.toggle('visible', window.scrollY > 300);
    }, { passive: true });

    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function initCodeLanguageLabels() {
    document.querySelectorAll('.highlight').forEach(block => {
      const code = block.querySelector('code[data-lang]');
      if (!code) return;
      const lang = code.getAttribute('data-lang');
      if (!lang || lang === 'fallback') return;

      const label = document.createElement('span');
      label.className = 'code-lang';
      label.textContent = lang;
      block.style.position = 'relative';
      block.appendChild(label);
    });
  }

  function initImageLightbox() {
    const contentRoot = document.querySelector('main .content');
    if (!contentRoot) return;

    const images = contentRoot.querySelectorAll('img');
    if (!images.length) return;

    const lightbox = document.createElement('div');
    lightbox.className = 'image-lightbox';
    lightbox.setAttribute('aria-hidden', 'true');

    const preview = document.createElement('img');
    preview.alt = '';
    let zoomLevel = 1;
    const minZoom = 0.5;
    const maxZoom = 4;
    const zoomStep = 0.2;

    function applyZoom() {
      preview.style.transform = `scale(${zoomLevel})`;
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'image-lightbox-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', i18n.imageClose || 'Close');
    closeBtn.textContent = '×';

    const controls = document.createElement('div');
    controls.className = 'image-lightbox-controls';

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.className = 'image-lightbox-zoom';
    zoomOutBtn.type = 'button';
    zoomOutBtn.setAttribute('aria-label', i18n.imageZoomOut || 'Zoom out');
    zoomOutBtn.textContent = '−';

    const zoomInBtn = document.createElement('button');
    zoomInBtn.className = 'image-lightbox-zoom';
    zoomInBtn.type = 'button';
    zoomInBtn.setAttribute('aria-label', i18n.imageZoomIn || 'Zoom in');
    zoomInBtn.textContent = '+';

    controls.appendChild(zoomOutBtn);
    controls.appendChild(zoomInBtn);
    controls.appendChild(closeBtn);

    lightbox.appendChild(preview);
    lightbox.appendChild(controls);
    document.body.appendChild(lightbox);

    function closeLightbox() {
      lightbox.classList.remove('active');
      lightbox.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      preview.removeAttribute('src');
      zoomLevel = 1;
      applyZoom();
    }

    function zoomIn() {
      zoomLevel = Math.min(maxZoom, Number((zoomLevel + zoomStep).toFixed(2)));
      applyZoom();
    }

    function zoomOut() {
      zoomLevel = Math.max(minZoom, Number((zoomLevel - zoomStep).toFixed(2)));
      applyZoom();
    }

    images.forEach((img) => {
      img.addEventListener('click', (event) => {
        event.preventDefault();
        preview.src = img.currentSrc || img.src;
        preview.alt = img.alt || '';
        zoomLevel = 1;
        applyZoom();
        lightbox.classList.add('active');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      });
    });

    lightbox.addEventListener('click', (event) => {
      if (event.target === lightbox) closeLightbox();
    });
    zoomInBtn.addEventListener('click', zoomIn);
    zoomOutBtn.addEventListener('click', zoomOut);
    closeBtn.addEventListener('click', closeLightbox);
    document.addEventListener('keydown', (event) => {
      if (!lightbox.classList.contains('active')) return;
      if (event.key === 'Escape') {
        closeLightbox();
        return;
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomIn();
        return;
      }
      if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        zoomOut();
      }
    });
  }

  function initSearch() {
    let searchData = null;
    const modal = document.getElementById('search-modal');
    const input = document.getElementById('search-input');
    const results = document.getElementById('search-results');
    const openBtn = document.getElementById('search-btn');
    const closeBtn = document.getElementById('search-close');
    if (!modal || !input || !results || !openBtn || !closeBtn) return;

    function openSearch() {
      modal.hidden = false;
      input.value = '';
      results.innerHTML = '';
      input.focus();
      if (!searchData) loadIndex();
    }

    function closeSearch() {
      modal.hidden = true;
    }

    async function loadIndex() {
      try {
        const resp = await fetch(config.searchIndexURL || '/index.json');
        searchData = await resp.json();
      } catch (e) {
        console.error('Failed to load search index', e);
      }
    }

    function search(query) {
      if (!searchData || !query.trim()) {
        results.innerHTML = '';
        return;
      }

      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      const matched = searchData
        .map(item => {
          const title = item.title.toLowerCase();
          const content = (item.content || '').toLowerCase();
          const tags = (item.tags || []).join(' ').toLowerCase();

          let score = 0;
          for (const word of words) {
            if (title.includes(word)) score += 10;
            if (tags.includes(word)) score += 5;
            if (content.includes(word)) score += 1;
          }
          return { ...item, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      renderResults(matched, words);
    }

    function renderResults(items, words) {
      if (items.length === 0) {
        results.innerHTML = `<li class="search-empty">${escapeHtml(i18n.searchNoResults || 'No results found')}</li>`;
        return;
      }

      results.innerHTML = items.map(item => {
        const title = highlight(item.title, words);
        const content = item.content || '';
        const snippet = highlight(content.slice(0, 120) + (content.length > 120 ? '...' : ''), words);
        const tags = (item.tags || []).map(t => `<span>#${escapeHtml(t)}</span>`).join('');

        return `<li><a href="${escapeHtml(item.url)}">
          <div class="title">${title}</div>
          <div class="meta">${escapeHtml(item.date || '')}</div>
          ${tags ? `<div class="tags">${tags}</div>` : ''}
          <div class="snippet">${snippet}</div>
        </a></li>`;
      }).join('');
    }

    function highlight(text, words) {
      let result = escapeHtml(text);
      for (const word of words) {
        const regex = new RegExp(`(${escapeRegex(word)})`, 'gi');
        result = result.replace(regex, '<mark>$1</mark>');
      }
      return result;
    }

    function escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, c =>
        ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    function escapeRegex(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    openBtn.addEventListener('click', openSearch);
    closeBtn.addEventListener('click', closeSearch);
    modal.addEventListener('click', e => { if (e.target === modal) closeSearch(); });
    input.addEventListener('input', e => search(e.target.value));

    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
      }
      if (e.key === 'Escape') closeSearch();
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    initReadingProgress();
    initThemeToggle();
    initCodeCopy();
    initBackToTop();
    initCodeLanguageLabels();
    initImageLightbox();
    initSearch();
  });
})();
