import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile, rm, mkdtemp, access, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { compile as compileMdx } from '@mdx-js/mdx';
import { build } from 'esbuild';
import matter from 'gray-matter';
import { parse as parseToml } from 'smol-toml';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';

const theme = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: {
  site: { type: 'string', default: '.' },
  drafts: { type: 'boolean', default: false },
  future: { type: 'boolean', default: false },
} });
const site = await realpath(path.resolve(values.site));
const content = path.join(site, 'content');
const output = path.join(site, '.stark-mdx');

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(filename) : entry.isFile() ? [filename] : [];
  }));
  return files.flat().sort();
}

function frontmatter(source) {
  return source.startsWith('+++')
    ? matter(source, { delimiters: '+++', language: 'toml', engines: { toml: parseToml } })
    : matter(source);
}

// Collect only actual Markdown headings; code fences and JSX source are not headings.
function headingsPlugin(headings) {
  return () => tree => {
    function visit(node) {
      if (node.type === 'element' && /^h[1-6]$/.test(node.tagName)) {
        const text = n => n.type === 'text' ? n.value : (n.children || []).map(text).join('');
        headings.push({ level: Number(node.tagName[1]), id: node.properties.id, text: text(node) });
      }
      for (const child of node.children || []) visit(child);
    }
    visit(tree);
  };
}

async function compile(filename, staging) {
  const relative = path.relative(content, filename);
  if (path.basename(filename).startsWith('_index.')) {
    throw new Error(`${relative}: MDX is supported for individual pages, not section or home pages.`);
  }
  const target = relative.replace(/\.mdx$/, '.html');
  for (const extension of ['md', 'markdown', 'html', 'htm']) {
    const existing = relative.replace(/\.mdx$/, `.${extension}`);
    try {
      await access(path.join(content, existing));
      throw new Error(`${relative} conflicts with ${existing}; keep only one page source.`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const source = await readFile(filename, 'utf8');
  const parsed = frontmatter(source);
  if (parsed.data.draft && !values.drafts) return false;
  const publication = parsed.data.publishDate ?? parsed.data.publishdate ?? parsed.data.date;
  if (publication && new Date(publication) > new Date() && !values.future) return false;
  const expiry = parsed.data.expiryDate ?? parsed.data.expirydate;
  if (expiry && new Date(expiry) <= new Date()) return false;
  const headings = [];
  const key = createHash('sha256').update(relative).digest('hex').slice(0, 16);
  const scratch = await mkdtemp(path.join(tmpdir(), 'stark-mdx-'));
  try {
    const plugin = collect => ({
      name: 'stark-mdx-frontmatter',
      setup(bundler) {
        bundler.onLoad({ filter: /\.mdx$/ }, async args => {
          const raw = frontmatter(await readFile(args.path, 'utf8')).content;
          // Compile imported MDX with the same syntax options as the page.
          const compiled = await compileMdx(raw, {
            remarkPlugins: [remarkGfm],
            rehypePlugins: [rehypeSlug, ...(collect && args.path === filename ? [headingsPlugin(headings)] : [])],
          });
          return { contents: String(compiled), loader: 'js', resolveDir: path.dirname(args.path) };
        });
      },
    });
    const options = {
      bundle: true,
      format: 'esm',
      jsx: 'automatic',
      nodePaths: [path.join(theme, 'node_modules')],
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
    };
    const server = path.join(scratch, 'server.mjs');
    await build({
      ...options,
      platform: 'node',
      banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
      outfile: server,
      plugins: [plugin(true)],
      stdin: {
        contents: `import React from 'react'; import { renderToString } from 'react-dom/server'; import Content from ${JSON.stringify(filename)}; export default renderToString(React.createElement(Content));`,
        resolveDir: theme,
      },
    });
    const html = (await import(pathToFileURL(server).href)).default;
    const assets = path.join(staging, 'static', 'stark-mdx', key);
    await mkdir(assets, { recursive: true });
    const client = await build({
      ...options,
      platform: 'browser',
      outdir: assets,
      entryNames: '[name]-[hash]',
      assetNames: '[name]-[hash]',
      minify: true,
      metafile: true,
      plugins: [plugin(false)],
      stdin: {
        contents: `import React from 'react'; import { hydrateRoot } from 'react-dom/client'; import Content from ${JSON.stringify(filename)}; hydrateRoot(document.getElementById('stark-mdx-root'), React.createElement(Content));`,
        resolveDir: theme,
        sourcefile: 'article.jsx',
        loader: 'jsx',
      },
    });
    const assetPaths = Object.keys(client.metafile.outputs).map(file => path.resolve(file));
    const publicPath = file => path.relative(path.join(staging, 'static'), file).split(path.sep).join('/');
    const metadata = {
      ...parsed.data,
      markup: 'html',
      outputs: ['HTML'],
      stark_mdx: {
        script: publicPath(assetPaths.find(file => file.endsWith('.js'))),
        styles: assetPaths.filter(file => file.endsWith('.css')).map(publicPath),
        headings,
        source: `stark-mdx/${key}/source.mdx`,
      },
    };
    const destination = path.join(staging, 'content', target);
    await mkdir(path.dirname(destination), { recursive: true });
    // Hugo's HTML renderer preserves React's markup, including whitespace in code blocks.
    await writeFile(destination, `${JSON.stringify(metadata, null, 2)}\n\n<div id="stark-mdx-root">${html}</div>\n`);
    await writeFile(path.join(assets, 'source.mdx'), source);
    return true;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

const sources = (await filesUnder(content)).filter(file => file.endsWith('.mdx'));
const staging = await mkdtemp(path.join(site, '.stark-mdx-build-'));
try {
  let count = 0;
  for (const filename of sources) if (await compile(filename, staging)) count++;
  await mkdir(path.join(staging, 'content'), { recursive: true });
  await mkdir(path.join(staging, 'static'), { recursive: true });
  await rm(output, { recursive: true, force: true });
  const { rename } = await import('node:fs/promises');
  await rename(staging, output);
  console.log(`Compiled ${count} MDX page(s) into ${output}`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
