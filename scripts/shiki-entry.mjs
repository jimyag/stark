// Entry that gets bundled by scripts/build-shiki.mjs.
// Exposes a single `codeToHtml(content, options)` mirror of the full shiki API,
// but only ships the two themes we use and lazy-imports each requested grammar.
import { createHighlighterCore } from '@shikijs/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
import githubLight from '@shikijs/themes/github-light';
import githubDark from '@shikijs/themes/github-dark';

// Keep keys aligned with assets/js/stark.js languageFromPath.
const langLoaders = {
  c: () => import('@shikijs/langs/c'),
  cpp: () => import('@shikijs/langs/cpp'),
  css: () => import('@shikijs/langs/css'),
  dockerfile: () => import('@shikijs/langs/dockerfile'),
  go: () => import('@shikijs/langs/go'),
  html: () => import('@shikijs/langs/html'),
  ini: () => import('@shikijs/langs/ini'),
  java: () => import('@shikijs/langs/java'),
  javascript: () => import('@shikijs/langs/javascript'),
  json: () => import('@shikijs/langs/json'),
  jsx: () => import('@shikijs/langs/jsx'),
  markdown: () => import('@shikijs/langs/markdown'),
  mdx: () => import('@shikijs/langs/mdx'),
  python: () => import('@shikijs/langs/python'),
  rust: () => import('@shikijs/langs/rust'),
  shellscript: () => import('@shikijs/langs/shellscript'),
  sql: () => import('@shikijs/langs/sql'),
  toml: () => import('@shikijs/langs/toml'),
  tsx: () => import('@shikijs/langs/tsx'),
  typescript: () => import('@shikijs/langs/typescript'),
  xml: () => import('@shikijs/langs/xml'),
  yaml: () => import('@shikijs/langs/yaml'),
};

let highlighterPromise;

async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [githubLight, githubDark],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function plainTextToHtml(content) {
  const lines = content.split('\n').map(line => `<span class="line">${escapeHtml(line)}</span>`).join('\n');
  return `<pre class="shiki shiki-themes github-dark github-light" style="--shiki-dark:#E1E4E8;--shiki-light:#24292E;--shiki-dark-bg:#24292e;--shiki-light-bg:#fff" tabindex="0"><code>${lines}</code></pre>`;
}

export async function codeToHtml(content, options) {
  const lang = options?.lang;
  if (!lang || lang === 'text' || !langLoaders[lang]) {
    return plainTextToHtml(content);
  }
  const highlighter = await getHighlighter();
  if (!highlighter.getLoadedLanguages().includes(lang)) {
    await highlighter.loadLanguage((await langLoaders[lang]()).default);
  }
  return highlighter.codeToHtml(content, { ...options, lang });
}
