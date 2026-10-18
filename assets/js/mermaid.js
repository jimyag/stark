// Loaded only on pages containing Mermaid code blocks.
(function () {
const i18n = window.StarkI18n || {};

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
