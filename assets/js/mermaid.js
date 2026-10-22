// Loaded only on pages containing Mermaid code blocks.
(function () {
const i18n = window.StarkI18n || {};

function colorDiagramRegions(block) {
    const svg = block.querySelector('svg');
    let color = 0;
    for (const rect of block.querySelectorAll('.pele-cluster > rect')) {
        if (!['var(--_a)', 'var(--_s)'].includes(rect.getAttribute('fill'))) continue;
        rect.setAttribute('fill', `var(--diagram-branch-${color++ % 4})`);
        rect.setAttribute('fill-opacity', '1');
    }
    const frames = [...block.querySelectorAll('.pele-frame')].map(frame => ({
        frame,
        bounds: frame.querySelector(':scope > rect')
    })).filter(item => item.bounds);
    if (!frames.length) return;
    // Paint outer frames first, below lifelines and labels, so nested branches stay distinct.
    frames.sort((a, b) => b.bounds.width.baseVal.value * b.bounds.height.baseVal.value
        - a.bounds.width.baseVal.value * a.bounds.height.baseVal.value);
    const backgrounds = document.createElementNS(svg.namespaceURI, 'g');
    backgrounds.setAttribute('class', 'stark-region-backgrounds');
    backgrounds.setAttribute('pointer-events', 'none');
    for (const { frame, bounds } of frames) {
        const top = bounds.y.baseVal.value;
        const edges = [top, ...[...frame.querySelectorAll(':scope > path')].map(path => path.getBBox().y),
            top + bounds.height.baseVal.value];
        for (let index = 0; index < edges.length - 1; index++) {
            const rect = document.createElementNS(svg.namespaceURI, 'rect');
            rect.setAttribute('x', bounds.x.baseVal.value);
            rect.setAttribute('y', edges[index]);
            rect.setAttribute('width', bounds.width.baseVal.value);
            rect.setAttribute('height', edges[index + 1] - edges[index]);
            rect.setAttribute('fill', `var(--diagram-branch-${color++ % 4})`);
            backgrounds.append(rect);
        }
    }
    const foreground = svg.querySelector('.pele-lifelines, .pele-frames');
    foreground.before(backgrounds);
}

function preserveMermaidSize(block) {
    const svg = block.querySelector('svg');
    const viewBox = svg?.viewBox?.baseVal;
    if (!viewBox?.width || !viewBox?.height) return;
    const contentWidth = block.closest('.content')?.clientWidth || block.clientWidth;
    block.classList.toggle('mermaid-compact', viewBox.width <= contentWidth - 48);
    svg.style.width = `${viewBox.width}px`;
    svg.style.height = `${viewBox.height}px`;
    svg.style.maxWidth = 'none';
}

function openMermaidLightbox(block) {
    const svg = block.querySelector('svg');
    if (!svg || !window.Stark?.openLightbox) return;
    const content = svg.cloneNode(true);
    content.style.width = '';
    content.style.height = '';
    window.Stark.openLightbox({ mode: 'mermaid', content, returnFocus: block });
    const controls = document.querySelector('.image-lightbox-controls');
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'image-lightbox-zoom diagram-copy';
    copy.textContent = i18n.copyImage || 'Copy image';
    copy.setAttribute('aria-live', 'polite');
    copy.addEventListener('click', async () => {
        try {
            // Start the clipboard write during the click; rasterization completes asynchronously.
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': diagramPNG(svg) })]);
            copy.textContent = i18n.copied || 'Copied';
        } catch (error) {
            copy.textContent = i18n.copyFailed || 'Copy failed';
            console.error('Copy diagram failed', error);
        }
    });
    controls.insertBefore(copy, controls.lastElementChild);
}

async function diagramPNG(svg) {
    const clone = svg.cloneNode(true);
    const sourceNodes = [svg, ...svg.querySelectorAll('*')];
    const cloneNodes = [clone, ...clone.querySelectorAll('*')];
    const properties = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity',
        'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'color',
        'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline'];
    sourceNodes.forEach((node, index) => {
        const style = getComputedStyle(node);
        properties.forEach(property => cloneNodes[index].style.setProperty(property, style.getPropertyValue(property)));
    });
    const { width, height } = svg.viewBox.baseVal;
    clone.setAttribute('width', width);
    clone.setAttribute('height', height);
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;
    clone.style.transform = 'none';
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(width * 2);
        canvas.height = Math.ceil(height * 2);
        const context = canvas.getContext('2d');
        context.fillStyle = getComputedStyle(svg).getPropertyValue('--pele-bg');
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return await new Promise((resolve, reject) => canvas.toBlob(blob => blob
            ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png'));
    } finally {
        URL.revokeObjectURL(url);
    }
}

async function start() {
    try {
        const { render } = await import('https://cdn.jsdelivr.net/npm/pele@1.6.0/dist/pele.js');
        await document.fonts.ready;
        document.querySelectorAll('.mermaid').forEach((block, index) => {
            const source = block.textContent.trim();
            try {
                const style = getComputedStyle(block);
                block.innerHTML = render(source, {
                    fontFamily: style.fontFamily,
                    fontSize: parseFloat(style.fontSize),
                    idPrefix: `stark-mermaid-${index}`,
                    responsive: false,
                    autoDirection: false
                }).svg;
                colorDiagramRegions(block);
                preserveMermaidSize(block);
                block.setAttribute('role', 'button');
                block.setAttribute('aria-label', i18n.imageClickZoom || 'Click to zoom');
                block.setAttribute('tabindex', '0');
                block.addEventListener('click', (event) => {
                    if (event.target.closest('a')) return;
                    openMermaidLightbox(block);
                });
                block.addEventListener('keydown', (event) => {
                    if (event.target !== block) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openMermaidLightbox(block);
                    }
                });
            } catch (error) {
                console.error(`Pele render failed at diagram ${index + 1}`, error);
                block.textContent = String(error.message || error);
            }
        });
    } catch (error) {
        console.error('Failed to load Pele from CDN', error);
    }
}

document.addEventListener('stark:theme-change', () => window.Stark?.closeLightbox?.());
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
    start();
}
})();
