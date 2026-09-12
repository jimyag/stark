import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const theme = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(theme, 'scripts/mdx.mjs');

test('MDX compiles server HTML, imports, metadata, and preserves the previous build on failure', async () => {
  const site = await mkdtemp(path.join(tmpdir(), 'stark-mdx-test-'));
  const post = path.join(site, 'content/blog/demo');
  const generated = path.join(site, '.stark-mdx/content/blog/demo/index.html');
  const run = (...args) => execFileSync(process.execPath, [script, '--site', site, ...args], { encoding: 'utf8' });
  try {
    await mkdir(post, { recursive: true });
    await writeFile(path.join(post, 'Counter.jsx'), "import {useState} from 'react'; export default function Counter(){const [n,set]=useState(0);return <button onClick={()=>set(n+1)}>Count: {n}</button>}");
    const source = `+++\ntitle = "Example"\nslug = "demo"\ndate = 2020-01-01T00:00:00Z\n+++\n\nimport Counter from './Counter.jsx'\n\n## Same\n\n<Counter />\n\n## Same\n\n\`\`\`js\nfirst\n\nsecond\n\`\`\`\n`;
    await writeFile(path.join(post, 'index.mdx'), source);
    run();
    const html = await readFile(generated, 'utf8');
    assert.match(html, /"title": "Example"/);
    assert.match(html, /"date": "2020-01-01T00:00:00.000Z"/);
    assert.match(html, /<button>Count: <!-- -->0<\/button>/);
    assert.match(html, /first\n\nsecond/);
    assert.match(html, /id="same-1"/);
    const metadata = JSON.parse(html.slice(0, html.indexOf('\n\n<div')));
    assert.equal(metadata.stark_mdx.headings.length, 2);
    assert.ok((await readFile(path.join(site, '.stark-mdx/static', metadata.stark_mdx.script))).length > 0);
    assert.equal(await readFile(path.join(site, '.stark-mdx/static', metadata.stark_mdx.source), 'utf8'), source);

    await writeFile(path.join(post, 'index.md'), 'existing page');
    const conflict = spawnSync(process.execPath, [script, '--site', site], { encoding: 'utf8' });
    assert.notEqual(conflict.status, 0);
    assert.match(conflict.stderr, /conflicts with/);
    assert.equal(await readFile(generated, 'utf8'), html);
    await rm(path.join(post, 'index.md'));
    await writeFile(path.join(post, 'index.mdx'), source + '\n<Unclosed>\n');
    assert.notEqual(spawnSync(process.execPath, [script, '--site', site]).status, 0);
    assert.equal(await readFile(generated, 'utf8'), html);

    await writeFile(path.join(post, 'index.mdx'), '---\ntitle: Draft\ndraft: true\n---\n\nNot public');
    run();
    assert.deepEqual(await readdir(path.join(site, '.stark-mdx/static')), []);
    assert.deepEqual(await readdir(path.join(site, '.stark-mdx/content')), []);
    run('--drafts');
    assert.match(await readFile(generated, 'utf8'), /Not public/);
    await rm(path.join(post, 'index.mdx'));
    run();
    assert.deepEqual(await readdir(path.join(site, '.stark-mdx/content')), []);
  } finally {
    await rm(site, { recursive: true, force: true });
  }
});

test('Hugo publishes SSR, TOC, RSS and search under a base path without publishing component source', async () => {
  const site = await mkdtemp(path.join(tmpdir(), 'stark-mdx-hugo-'));
  try {
    await cp(path.join(theme, 'exampleSite/content'), path.join(site, 'content'), { recursive: true });
    for (const config of ['hugo.toml', 'mdx.toml']) {
      await cp(path.join(theme, 'exampleSite', config), path.join(site, config));
    }
    execFileSync(process.execPath, [script, '--site', site]);
    execFileSync('hugo', ['--source', site, '--themesDir', path.dirname(theme), '--config', 'hugo.toml,mdx.toml', '--baseURL', 'https://example.com/nested/']);
    const publicDir = path.join(site, 'public');
    const html = await readFile(path.join(publicDir, 'posts/mdx-demo/index.html'), 'utf8');
    assert.match(html, /<button>Count: <!-- -->0<\/button>/);
    assert.match(html, /href="#interactive-counter"/);
    assert.match(html, /src="\/nested\/stark-mdx\//);
    assert.deepEqual(await readdir(path.join(publicDir, 'posts/mdx-demo')), ['index.html']);
    const index = JSON.parse(await readFile(path.join(publicDir, 'index.json'), 'utf8'));
    assert.match(index.find(page => page.title === 'MDX interactive example').content, /initial HTML/);
    assert.match(await readFile(path.join(publicDir, 'index.xml'), 'utf8'), /MDX interactive example/);
    const ordinary = await readFile(path.join(publicDir, 'posts/hello-world/index.html'), 'utf8');
    assert.doesNotMatch(ordinary, /<script[^>]+stark-mdx/);
    assert.match(ordinary, /class="highlight"/);
    assert.match(ordinary, /mermaid/);
  } finally {
    await rm(site, { recursive: true, force: true });
  }
});
