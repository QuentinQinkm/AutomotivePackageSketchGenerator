export async function loadInlineSvgs(elementsOrSelector) {
    const elements = resolveElements(elementsOrSelector);
    await Promise.all(elements.map((element) => inlineSvgElement(element)));
}

function resolveElements(input) {
    if (!input) return [];
    if (typeof input === 'string') {
        return Array.from(document.querySelectorAll(input));
    }
    if (input instanceof Element) {
        return [input];
    }
    if (typeof input.length === 'number') {
        return Array.from(input);
    }
    return [];
}

async function inlineSvgElement(element) {
    if (!element) return;
    const src = element.dataset.inlineSvg;
    if (!src) return;
    try {
        const response = await fetch(src);
        if (!response.ok) {
            throw new Error(`Failed to load SVG: ${src}`);
        }
        const svgMarkup = await response.text();
        element.innerHTML = svgMarkup;
        const svg = element.querySelector('svg');
        if (svg) {
            svg.setAttribute('width', '100%');
            svg.setAttribute('height', '100%');
            if (!svg.getAttribute('preserveAspectRatio')) {
                svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            }
            svg.setAttribute('focusable', 'false');
            svg.setAttribute('aria-hidden', 'true');
        }
        element.removeAttribute('data-inline-svg');
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(error);
    }
}

