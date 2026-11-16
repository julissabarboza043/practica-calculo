// Convierte texto con LaTeX (\( … \), \[ … \], $$ … $$, $ … $) en HTML listo para KaTeX.

const MATH = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g;

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Texto del enunciado/explicación → HTML (sin renderizar aún las fórmulas). */
export function mathHTML(text) {
  const parts = String(text ?? '').split(MATH);
  let html = '';
  parts.forEach((part, i) => {
    if (i % 2 === 1) html += esc(part);
    else {
      html += esc(part)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n{2,}/g, '<br><br>')
        .replace(/\n/g, '<br>');
    }
  });
  return html;
}

/** Renderiza las fórmulas dentro de un elemento ya insertado en la página. */
export function typeset(el) {
  if (!window.renderMathInElement) {
    // KaTeX todavía no cargó: reintentar en un momento.
    setTimeout(() => window.renderMathInElement && typeset(el), 150);
    return;
  }
  window.renderMathInElement(el, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false },
      { left: '$', right: '$', display: false },
    ],
    throwOnError: false,
  });
}

/** Pone el texto con fórmulas dentro del elemento. */
export function setMath(el, text) {
  el.innerHTML = mathHTML(text);
  typeset(el);
}
