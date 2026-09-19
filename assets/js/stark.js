(function() {
  const i18n = window.StarkI18n || {};
  const config = window.StarkConfig || {};
  const githubFileMaxBytes = 5 * 1024 * 1024;
  const githubFileTimeout = 15000;

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

  function initPalettePicker() {
    const root = document.documentElement;
    const picker = document.querySelector('.palette-picker');
    const options = [...document.querySelectorAll('.palette-options [data-palette]')];
    const palettes = new Set(['paper', 'ocean', 'forest']);
    if (!picker || !options.length) return;

    function applyPalette(palette, persist) {
      if (!palettes.has(palette)) palette = 'paper';
      root.setAttribute('data-palette', palette);
      options.forEach(option => {
        option.setAttribute('aria-pressed', option.dataset.palette === palette ? 'true' : 'false');
      });
      if (persist) {
        localStorage.setItem('stark-palette', palette);
        document.dispatchEvent(new CustomEvent('stark:palette-change', { detail: { palette } }));
      }
    }

    applyPalette(root.getAttribute('data-palette') || 'paper', false);
    options.forEach(option => {
      option.addEventListener('click', () => {
        applyPalette(option.dataset.palette, true);
        picker.open = false;
      });
    });
  }

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

  function parseLineNumber(value, name) {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) {
      throw new Error(`${name} must be a positive integer`);
    }
    return number;
  }

  function parseGitHubFileURL(value, startValue, endValue) {
    if (!value) throw new Error('GitHub file URL is missing');

    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error('GitHub file URL is invalid');
    }

    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !['github.com', 'www.github.com'].includes(hostname)) {
      throw new Error('only https://github.com/... file URLs are supported');
    }

    let parts;
    try {
      parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    } catch {
      throw new Error('GitHub file URL contains invalid escaping');
    }

    if (parts.length < 5 || parts[2] !== 'blob') {
      throw new Error('GitHub file URL must use /<owner>/<repo>/blob/<ref>/<path>');
    }

    const [owner, repo, , ref, ...fileParts] = parts;
    const filePath = fileParts.join('/');
    if (!owner || !repo || !ref || !filePath || ref.includes('/')) {
      throw new Error('GitHub file URL must contain a single-segment ref and a file path');
    }
    if (fileParts.some(part => part === '.' || part === '..')) {
      throw new Error('GitHub file path cannot contain . or .. segments');
    }

    let hashStart = null;
    let hashEnd = null;
    const lineRange = url.hash.match(/^#L(\d+)(?:-L?(\d+))?$/i);
    if (url.hash && !lineRange) {
      throw new Error('GitHub file URL line anchors must use #L10 or #L10-L20');
    }
    if (lineRange) {
      hashStart = parseLineNumber(lineRange[1], 'line start');
      hashEnd = parseLineNumber(lineRange[2] || lineRange[1], 'line end');
    }

    const start = parseLineNumber(startValue, 'start') ?? hashStart;
    const end = parseLineNumber(endValue, 'end') ?? hashEnd;
    if (start !== null && end !== null && start > end) {
      throw new Error('start must not be greater than end');
    }

    const encodedPath = fileParts.map(encodeURIComponent).join('/');
    const rawURL = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(ref)}/${encodedPath}`;

    return { url: url.href, owner, repo, ref, filePath, rawURL, start, end };
  }

  function languageFromPath(filePath) {
    const filename = filePath.split('/').pop() || '';
    const extension = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
    const languages = {
      bash: 'shell',
      css: 'css',
      go: 'go',
      h: 'c',
      hpp: 'cpp',
      html: 'html',
      java: 'java',
      js: 'javascript',
      json: 'json',
      jsx: 'jsx',
      md: 'markdown',
      mdx: 'mdx',
      py: 'python',
      rs: 'rust',
      sh: 'shell',
      sql: 'sql',
      toml: 'toml',
      ts: 'typescript',
      tsx: 'tsx',
      xml: 'xml',
      yaml: 'yaml',
      yml: 'yaml',
    };
    return languages[extension] || extension || 'text';
  }

  function githubFileElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function renderGitHubFileError(block, url, error) {
    block.replaceChildren();
    block.dataset.githubFileState = 'error';
    const message = githubFileElement('p', 'github-file-error-message', `${i18n.githubError || 'GitHub file loading failed: '}${error.message}`);
    const link = githubFileElement('a', null, i18n.githubOpenRaw || 'Open source link');
    link.href = url || '#';
    link.target = '_blank';
    link.rel = 'noreferrer noopener';

    const errorBox = githubFileElement('div', 'github-file-error');
    errorBox.setAttribute('role', 'alert');
    errorBox.append(message, link);
    block.appendChild(errorBox);
  }

  function renderGitHubFile(block, source, content) {
    const normalized = content.replace(/\r\n?/g, '\n');
    const hasTrailingNewline = normalized.endsWith('\n');
    const allLines = normalized.split('\n');
    if (hasTrailingNewline) allLines.pop();
    if (allLines.length === 0) allLines.push('');

    const start = source.start ?? 1;
    const end = source.end ?? allLines.length;
    if (start > allLines.length || end > allLines.length) {
      throw new Error(`line range ${start}-${end} exceeds the file's ${allLines.length} lines`);
    }

    const filename = source.filePath.split('/').pop() || source.filePath;
    const header = githubFileElement('div', 'github-file-header');
    const title = githubFileElement('div', 'github-file-title');
    title.append(
      githubFileElement('span', 'github-file-brand', 'GitHub'),
      githubFileElement('code', 'github-file-path', `${source.owner}/${source.repo}/${source.filePath}`),
    );

    const actions = githubFileElement('div', 'github-file-actions');
    const metadata = githubFileElement('span', 'github-file-meta', `${filename} · ${source.ref.slice(0, 12)} · ${start}-${end}/${allLines.length}`);
    const sourceLink = githubFileElement('a', 'github-file-link', i18n.githubOpen || 'Open on GitHub');
    sourceLink.href = source.url;
    sourceLink.target = '_blank';
    sourceLink.rel = 'noreferrer noopener';
    const toggleButton = githubFileElement('button', 'github-file-toggle', i18n.githubCollapse || 'Collapse');
    toggleButton.type = 'button';
    toggleButton.setAttribute('aria-expanded', 'true');
    toggleButton.addEventListener('click', () => {
      const collapsed = block.classList.toggle('github-file-collapsed');
      toggleButton.textContent = collapsed
        ? (i18n.githubExpand || 'Expand')
        : (i18n.githubCollapse || 'Collapse');
      toggleButton.setAttribute('aria-expanded', String(!collapsed));
    });
    const copyButton = githubFileElement('button', 'copy-btn github-file-copy', i18n.copy || 'Copy');
    copyButton.type = 'button';
    copyButton.setAttribute('aria-label', i18n.copyCode || i18n.copy || 'Copy code');
    copyButton.addEventListener('click', async () => {
      try {
        await writeText(normalized);
        showCopyState(copyButton, true, i18n.copy || 'Copy');
      } catch {
        showCopyState(copyButton, false, i18n.copy || 'Copy');
      }
    });
    actions.append(metadata, sourceLink, toggleButton, copyButton);
    header.append(title, actions);

    const scroll = githubFileElement('div', 'github-file-scroll');
    scroll.tabIndex = 0;
    const pre = githubFileElement('pre', 'github-file-code');
    const code = githubFileElement('code');
    code.dataset.lang = languageFromPath(source.filePath);
    for (let lineNumber = start; lineNumber <= end; lineNumber++) {
      const line = githubFileElement('span', 'github-file-line', allLines[lineNumber - 1]);
      line.dataset.lineNumber = String(lineNumber);
      code.appendChild(line);
    }
    pre.appendChild(code);
    scroll.appendChild(pre);

    block.replaceChildren(header, scroll);
    block.dataset.githubFileState = 'loaded';
  }

  async function loadGitHubFile(block) {
    if (block.dataset.githubFileState) return;
    block.dataset.githubFileState = 'loading';

    let source;
    try {
      source = parseGitHubFileURL(block.dataset.githubUrl, block.dataset.githubStart, block.dataset.githubEnd);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), githubFileTimeout);
      let response;
      try {
        response = await fetch(source.rawURL, {
          headers: { Accept: 'text/plain' },
          signal: controller.signal,
        });
      } catch (error) {
        if (error.name === 'AbortError') throw new Error(`request timed out after ${githubFileTimeout / 1000}s`);
        throw new Error(`request failed: ${error.message}`);
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);

      const contentLength = Number(response.headers.get('content-length'));
      if (contentLength > githubFileMaxBytes) {
        throw new Error(`file is larger than ${githubFileMaxBytes / 1024 / 1024} MiB`);
      }
      const content = await response.text();
      if (new Blob([content]).size > githubFileMaxBytes) {
        throw new Error(`file is larger than ${githubFileMaxBytes / 1024 / 1024} MiB`);
      }
      renderGitHubFile(block, source, content);
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      renderGitHubFileError(block, source?.url, normalizedError);
      console.error('GitHub file loading failed', { url: block.dataset.githubUrl, error: normalizedError });
    }
  }

  function initGitHubFiles() {
    document.querySelectorAll('[data-github-file]').forEach(loadGitHubFile);
  }

  function initGitHubFilesWhenReady() {
    if (!document.getElementById('stark-mdx-root')) {
      initGitHubFiles();
      return;
    }
    if (document.documentElement.dataset.starkMdxReady === 'true') {
      initGitHubFiles();
      return;
    }
    document.addEventListener('stark:mdx-ready', initGitHubFiles, { once: true });
  }

  function initCodeCopy() {
    // Chroma wraps highlighted code in .highlight. MDX pages are rendered by
    // the MDX compiler instead, so Hugo emits plain <pre> there and the copy
    // button has to be attached to those blocks too.
    const blocks = [...document.querySelectorAll('.highlight')];
    document.querySelectorAll('main .content pre').forEach(pre => {
      if (!pre.closest('.highlight') && !pre.classList.contains('mermaid') && !pre.closest('.github-file')) blocks.push(pre);
    });

    blocks.forEach(block => {
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

  // MDX pages hydrate the article body, and React drops nodes it did not
  // render. Adding the copy buttons before hydration commits therefore both
  // fails and triggers a hydration mismatch, so wait for the MDX compiler's
  // ready signal instead.
  function initCodeCopyWhenReady() {
    if (!document.getElementById('stark-mdx-root')) {
      initCodeCopy();
      return;
    }
    if (document.documentElement.dataset.starkMdxReady === 'true') {
      initCodeCopy();
      return;
    }
    document.addEventListener('stark:mdx-ready', initCodeCopy, { once: true });
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
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      window.scrollTo({ top: 0, behavior });
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

    const images = [...contentRoot.querySelectorAll('img')]
      .filter(img => !img.closest('a'));
    if (!images.length) return;

    const lightbox = document.createElement('div');
    lightbox.className = 'image-lightbox';
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.setAttribute('aria-label', i18n.imagePreview || 'Image preview');
    lightbox.setAttribute('aria-hidden', 'true');

    const preview = document.createElement('img');
    preview.alt = '';
    let zoomLevel = 1;
    let lastFocus = null;
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
      if (lastFocus) lastFocus.focus();
      lastFocus = null;
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
      img.classList.add('image-lightbox-trigger');
      img.setAttribute('role', 'button');
      img.setAttribute('tabindex', '0');
      img.setAttribute('aria-label', i18n.imageClickZoom || 'Open image preview');

      function openFromImage(event) {
        event.preventDefault();
        lastFocus = img;
        preview.src = img.currentSrc || img.src;
        preview.alt = img.alt || '';
        zoomLevel = 1;
        applyZoom();
        lightbox.classList.add('active');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        closeBtn.focus();
      }

      img.addEventListener('click', openFromImage);
      img.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') openFromImage(event);
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
        return;
      }
      if (event.key === 'Tab') {
        const focusable = [zoomOutBtn, zoomInBtn, closeBtn];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
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
    let lastFocus = null;

    function openSearch() {
      lastFocus = document.activeElement;
      modal.hidden = false;
      document.body.style.overflow = 'hidden';
      input.value = '';
      results.innerHTML = '';
      input.focus();
      if (!searchData) loadIndex();
    }

    function closeSearch() {
      modal.hidden = true;
      document.body.style.overflow = '';
      if (lastFocus) lastFocus.focus();
      lastFocus = null;
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
    modal.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const focusable = [...modal.querySelectorAll('input, button, a[href]')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
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
    initPalettePicker();
    initCodeCopyWhenReady();
    initGitHubFilesWhenReady();
    initBackToTop();
    initCodeLanguageLabels();
    initImageLightbox();
    initSearch();
  });
})();
