// Extracted from layouts/partials/custom_body.html. Loaded as a classic script with defer.
(function () {

// Mermaid library is loaded dynamically in start() so the base IIFE stays tiny.
let mermaid = null;
let started = false;

const i18n = (typeof window !== 'undefined' && window.StarkI18n) || {};

function getMermaidTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'forest';
}

const mermaidFontFamily = '"0xProto", "LXGW WenKai", "霞鹜文楷", "STKaiti", "Kaiti SC", ui-monospace, ui-serif, Georgia, serif';

function getMermaidConfig() {
    return {
        startOnLoad: false,
        layout: 'elk',
        theme: getMermaidTheme(),
        securityLevel: 'loose',
        fontFamily: mermaidFontFamily,
        themeVariables: {
            fontFamily: mermaidFontFamily
        },
        flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
            nodeSpacing: 28,
            rankSpacing: 40,
            padding: 10,
            wrappingWidth: 180
        },
        er: {
            useMaxWidth: true
        }
    };
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

async function renderMermaids() {
    const mermaidBlocks = document.querySelectorAll('.mermaid');
    if (mermaidBlocks.length === 0) return;

    mermaidBlocks.forEach((el) => {
        if (!el.dataset.mermaidSource) {
            el.dataset.mermaidSource = el.textContent.trim();
        }
        el.removeAttribute('data-processed');
        el.innerHTML = el.dataset.mermaidSource;
    });

    mermaid.initialize(getMermaidConfig());
    for (const [index, block] of mermaidBlocks.entries()) {
        try {
            await mermaid.run({ nodes: [block] });
            preserveMermaidSize(block);
        } catch (error) {
            console.error(`Mermaid render failed at diagram ${index + 1}`, error);
        }
    }
    addMermaidClickHandlers();
}

// 为 mermaid 图表添加点击放大功能
function addMermaidClickHandlers() {
    document.querySelectorAll('.mermaid').forEach((el) => {
        if (el.dataset.clickHandlerAdded) return;
        el.dataset.clickHandlerAdded = 'true';
        
        el.style.cursor = 'pointer';
        el.style.transition = 'transform 0.2s';
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', window.StarkI18n.imageClickZoom);
        el.setAttribute('tabindex', '0');
        
        el.addEventListener('click', (e) => {
            e.preventDefault();
            openMermaidLightbox(el);
        });
        
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openMermaidLightbox(el);
            }
        });
    });
}

function openMermaidLightbox(mermaidEl) {
    const doOpen = () => {
        if (!window.Stark || typeof window.Stark.openLightbox !== 'function') return;
        const svg = mermaidEl.querySelector('svg');
        if (!svg) return;
        const clonedSvg = svg.cloneNode(true);
        clonedSvg.style.width = '';
        clonedSvg.style.height = '';
        if (svg.getAttribute('viewBox')) {
            clonedSvg.setAttribute('viewBox', svg.getAttribute('viewBox'));
        }
        window.Stark.openLightbox({ mode: 'mermaid', content: clonedSvg, returnFocus: mermaidEl });
    };
    // mermaid.js may execute before stark.js registers Stark.openLightbox; wait for it once.
    if (window.Stark && window.Stark.openLightbox) {
        doOpen();
    } else {
        setTimeout(doOpen, 0);
    }
}

function closeMermaidLightbox() {
    if (window.Stark && typeof window.Stark.closeLightbox === 'function') {
        window.Stark.closeLightbox();
    }
}

// 监听 mermaid 渲染完成
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
                if (node.classList && node.classList.contains('mermaid')) {
                    setTimeout(() => addMermaidClickHandlers(), 100);
                } else if (node.querySelectorAll) {
                    const mermaids = node.querySelectorAll('.mermaid');
                    if (mermaids.length > 0) {
                        setTimeout(() => addMermaidClickHandlers(), 100);
                    }
                }
            }
        });
    });
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

document.addEventListener('stark:theme-change', () => {
    closeMermaidLightbox();
    if (!mermaid) {
        start();
        return;
    }
    renderMermaids().catch((err) => {
        console.error('Failed to re-render mermaid diagrams', err);
    });
});

async function start() {
    if (started) return;
    started = true;
    try {
        const module = await import('https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.esm.min.mjs');
        mermaid = module.default || module;
    } catch (error) {
        console.error('Failed to load Mermaid from CDN', error);
        return;
    }
    renderMermaids().catch((err) => {
        console.error('Failed to render mermaid diagrams', err);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
    start();
}

})();
