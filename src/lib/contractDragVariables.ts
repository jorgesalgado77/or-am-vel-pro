/**
 * Injects drag & resize logic for {{variables}} inside a contract preview iframe.
 * Variables become draggable elements using transform (staying in document flow).
 * Dropped variables from palette use absolute positioning.
 * Changes are communicated back via postMessage.
 */

const DRAG_VARIABLES_SCRIPT = `
(function() {
  const HANDLE_SIZE = 8;
  let GRID_SIZE = __GRID_SIZE__;
  function snap(v) { return Math.round(v / GRID_SIZE) * GRID_SIZE; }
  function buildGridCSS(size) {
    return '.contract-page, [data-contract-page] { position: relative !important; } .contract-page::after, [data-contract-page]::after { content: \\'\\'; position: absolute; inset: 0; pointer-events: none; z-index: 50; background-image: linear-gradient(to right, hsl(210 20% 80% / 0.15) 1px, transparent 1px), linear-gradient(to bottom, hsl(210 20% 80% / 0.15) 1px, transparent 1px); background-size: ' + size + 'px ' + size + 'px; background-position: 0 0; }';
  }
  let activeEl = null;
  let dragState = null;

  function createResizeHandle() {
    const h = document.createElement('span');
    h.className = 'drag-variable-resize';
    h.style.cssText = 'position:absolute;bottom:-' + (HANDLE_SIZE/2) + 'px;right:-' + (HANDLE_SIZE/2) + 'px;width:' + HANDLE_SIZE + 'px;height:' + HANDLE_SIZE + 'px;background:hsl(210 80% 55%);border-radius:2px;cursor:nwse-resize;z-index:101;opacity:0;transition:opacity 0.15s;';
    return h;
  }

  function createInner(varText) {
    const inner = document.createElement('span');
    inner.className = 'drag-variable-inner';
    inner.style.cssText = 'display:inline-block;background:hsl(210 80% 55%/0.15);color:hsl(210 80% 45%);border:2px dashed hsl(210 80% 55%/0.5);border-radius:4px;padding:2px 6px;font-family:monospace;font-size:0.9em;white-space:nowrap;pointer-events:none;width:100%;height:100%;box-sizing:border-box;';
    inner.textContent = varText;
    return inner;
  }

  function createContextMenu() {
    var menu = document.createElement('div');
    menu.id = 'var-context-menu';
    menu.style.cssText = 'display:none;position:fixed;z-index:9999;background:#fff;border:1px solid #d1d5db;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:4px 0;min-width:140px;font-family:system-ui,sans-serif;font-size:13px;';
    var removeBtn = document.createElement('div');
    removeBtn.textContent = 'Remover variável';
    removeBtn.style.cssText = 'padding:6px 12px;cursor:pointer;color:#ef4444;transition:background 0.1s;';
    removeBtn.addEventListener('mouseenter', function() { removeBtn.style.background = '#fee2e2'; });
    removeBtn.addEventListener('mouseleave', function() { removeBtn.style.background = 'transparent'; });
    removeBtn.addEventListener('click', function() {
      if (menu._targetEl) {
        var idx = parseInt(menu._targetEl.getAttribute('data-var-idx'), 10);
        var varText = menu._targetEl.getAttribute('data-var-text');
        menu._targetEl.remove();
        window.parent.postMessage({ type: 'variable-removed', idx: idx, varText: varText }, '*');
      }
      menu.style.display = 'none';
    });
    menu.appendChild(removeBtn);
    document.body.appendChild(menu);
    document.addEventListener('click', function() { menu.style.display = 'none'; });
    return menu;
  }

  var contextMenu = null;

  function attachContextMenu(wrapper) {
    wrapper.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (!contextMenu) contextMenu = createContextMenu();
      contextMenu._targetEl = wrapper;
      contextMenu.style.display = 'block';
      contextMenu.style.left = e.clientX + 'px';
      contextMenu.style.top = e.clientY + 'px';
    });
  }

  function attachHover(wrapper, resizeHandle) {
    wrapper.addEventListener('mouseenter', () => {
      resizeHandle.style.opacity = '1';
      wrapper.style.outline = '2px solid hsl(210 80% 55% / 0.6)';
      wrapper.style.outlineOffset = '1px';
    });
    wrapper.addEventListener('mouseleave', () => {
      if (!dragState) {
        resizeHandle.style.opacity = '0';
        wrapper.style.outline = 'none';
      }
    });
  }

  function attachDragMove(wrapper, resizeHandle) {
    wrapper.addEventListener('mousedown', (e) => {
      if (e.target === resizeHandle) return;
      e.preventDefault();
      e.stopPropagation();
      activeEl = wrapper;
      var isAbsolute = wrapper.getAttribute('data-pos-mode') === 'absolute';
      if (isAbsolute) {
        dragState = {
          type: 'move-abs',
          startX: e.clientX,
          startY: e.clientY,
          startLeft: parseFloat(wrapper.style.left) || 0,
          startTop: parseFloat(wrapper.style.top) || 0,
        };
      } else {
        var tx = parseFloat(wrapper.getAttribute('data-tx')) || 0;
        var ty = parseFloat(wrapper.getAttribute('data-ty')) || 0;
        dragState = {
          type: 'move-rel',
          startX: e.clientX,
          startY: e.clientY,
          startTx: tx,
          startTy: ty,
        };
      }
      wrapper.style.zIndex = '200';
      wrapper.style.opacity = '0.85';
    });
  }

  function attachResize(wrapper, resizeHandle) {
    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      activeEl = wrapper;
      dragState = {
        type: 'resize',
        startX: e.clientX,
        startY: e.clientY,
        startW: wrapper.offsetWidth,
        startH: wrapper.offsetHeight,
      };
    });
  }

  function initDragVariables() {
    const marks = document.querySelectorAll('mark[data-placeholder-highlight]');
    marks.forEach((mark, idx) => {
      const varText = mark.textContent || '';

      // Instead of absolute positioning, wrap the mark in-place (inline)
      const wrapper = document.createElement('span');
      wrapper.className = 'drag-variable-wrapper';
      wrapper.setAttribute('data-var-idx', idx.toString());
      wrapper.setAttribute('data-var-text', varText);
      wrapper.setAttribute('draggable', 'false');
      wrapper.setAttribute('data-pos-mode', 'relative');
      wrapper.setAttribute('data-tx', '0');
      wrapper.setAttribute('data-ty', '0');

      // Keep in document flow with position:relative
      wrapper.style.position = 'relative';
      wrapper.style.cursor = 'move';
      wrapper.style.zIndex = '100';
      wrapper.style.display = 'inline-block';
      wrapper.style.minWidth = '40px';
      wrapper.style.minHeight = '20px';
      wrapper.style.userSelect = 'none';
      wrapper.style.webkitUserSelect = 'none';

      var inner = createInner(varText);
      wrapper.appendChild(inner);

      var resizeHandle = createResizeHandle();
      wrapper.appendChild(resizeHandle);

      attachHover(wrapper, resizeHandle);
      attachDragMove(wrapper, resizeHandle);
      attachResize(wrapper, resizeHandle);

      // Replace the mark but keep in flow
      mark.parentNode.replaceChild(wrapper, mark);
    });

    // Global mouse handlers
    document.addEventListener('mousemove', (e) => {
      if (!activeEl || !dragState) return;
      e.preventDefault();

      if (dragState.type === 'move-rel') {
        var dx = e.clientX - dragState.startX;
        var dy = e.clientY - dragState.startY;
        var tx = snap(dragState.startTx + dx);
        var ty = snap(dragState.startTy + dy);
        activeEl.style.transform = 'translate(' + tx + 'px, ' + ty + 'px)';
        activeEl.setAttribute('data-tx', tx.toString());
        activeEl.setAttribute('data-ty', ty.toString());
      } else if (dragState.type === 'move-abs') {
        var dx = e.clientX - dragState.startX;
        var dy = e.clientY - dragState.startY;
        activeEl.style.left = snap(dragState.startLeft + dx) + 'px';
        activeEl.style.top = snap(dragState.startTop + dy) + 'px';
      } else if (dragState.type === 'resize') {
        var dx = e.clientX - dragState.startX;
        var dy = e.clientY - dragState.startY;
        var newW = Math.max(40, snap(dragState.startW + dx));
        var newH = Math.max(20, snap(dragState.startH + dy));
        activeEl.style.width = newW + 'px';
        activeEl.style.height = newH + 'px';
      }
    });

    document.addEventListener('mouseup', () => {
      if (activeEl && dragState) {
        activeEl.style.zIndex = '100';
        activeEl.style.opacity = '1';
        notifyPositionChange(activeEl);
        activeEl = null;
        dragState = null;
      }
    });
  }

  function notifyPositionChange(el) {
    var idx = parseInt(el.getAttribute('data-var-idx'), 10);
    var varText = el.getAttribute('data-var-text');
    var isAbsolute = el.getAttribute('data-pos-mode') === 'absolute';
    var left, top;
    if (isAbsolute) {
      left = parseFloat(el.style.left) || 0;
      top = parseFloat(el.style.top) || 0;
    } else {
      left = parseFloat(el.getAttribute('data-tx')) || 0;
      top = parseFloat(el.getAttribute('data-ty')) || 0;
    }
    window.parent.postMessage({
      type: 'variable-position-change',
      idx: idx,
      varText: varText,
      left: left,
      top: top,
      width: el.offsetWidth,
      height: el.offsetHeight,
    }, '*');
  }

  function collectAllPositions() {
    var wrappers = document.querySelectorAll('.drag-variable-wrapper');
    var positions = [];
    wrappers.forEach(function(el) {
      var isAbsolute = el.getAttribute('data-pos-mode') === 'absolute';
      positions.push({
        idx: parseInt(el.getAttribute('data-var-idx'), 10),
        varText: el.getAttribute('data-var-text'),
        left: isAbsolute ? (parseFloat(el.style.left) || 0) : (parseFloat(el.getAttribute('data-tx')) || 0),
        top: isAbsolute ? (parseFloat(el.style.top) || 0) : (parseFloat(el.getAttribute('data-ty')) || 0),
        width: el.offsetWidth,
        height: el.offsetHeight,
      });
    });
    window.parent.postMessage({ type: 'all-variable-positions', positions: positions }, '*');
  }

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'get-all-positions') {
      collectAllPositions();
    } else if (e.data && e.data.type === 'drop-variable') {
      handleDropVariable(e.data.varText, e.data.x, e.data.y);
    } else if (e.data && e.data.type === 'set-grid-size') {
      GRID_SIZE = e.data.gridSize || 8;
      var style = document.getElementById('drag-grid-style');
      if (style) { style.textContent = buildGridCSS(GRID_SIZE); }
    }
  });

  function handleDropVariable(varText, x, y) {
    var page = document.querySelector('.contract-page') || document.body;
    if (!page) return;
    page.style.position = 'relative';

    var scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    var pageRect = page.getBoundingClientRect();
    var left = x - pageRect.left;
    var top = y - pageRect.top + scrollTop;

    var existing = document.querySelectorAll('.drag-variable-wrapper');
    var idx = existing.length;

    var wrapper = document.createElement('span');
    wrapper.className = 'drag-variable-wrapper';
    wrapper.setAttribute('data-var-idx', idx.toString());
    wrapper.setAttribute('data-var-text', varText);
    wrapper.setAttribute('draggable', 'false');
    wrapper.setAttribute('data-pos-mode', 'absolute');
    wrapper.style.position = 'absolute';
    wrapper.style.left = left + 'px';
    wrapper.style.top = top + 'px';
    wrapper.style.cursor = 'move';
    wrapper.style.zIndex = '100';
    wrapper.style.display = 'inline-block';
    wrapper.style.minWidth = '40px';
    wrapper.style.minHeight = '20px';
    wrapper.style.userSelect = 'none';
    wrapper.style.webkitUserSelect = 'none';

    var inner = createInner(varText);
    wrapper.appendChild(inner);

    var resizeHandle = createResizeHandle();
    wrapper.appendChild(resizeHandle);

    attachHover(wrapper, resizeHandle);
    attachDragMove(wrapper, resizeHandle);
    attachResize(wrapper, resizeHandle);

    page.appendChild(wrapper);

    window.parent.postMessage({
      type: 'variable-dropped',
      varText: varText,
      idx: idx,
      left: left,
      top: top,
      width: wrapper.offsetWidth,
      height: wrapper.offsetHeight,
    }, '*');

    notifyPositionChange(wrapper);
  }

  function tryInit() {
    var marks = document.querySelectorAll('mark[data-placeholder-highlight]');
    if (marks.length > 0) {
      initDragVariables();
    } else {
      var retries = 0;
      var interval = setInterval(function() {
        retries++;
        var m = document.querySelectorAll('mark[data-placeholder-highlight]');
        if (m.length > 0 || retries > 20) {
          clearInterval(interval);
          if (m.length > 0) initDragVariables();
        }
      }, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(tryInit, 50); });
  } else {
    setTimeout(tryInit, 150);
  }
})();
`;

const DRAG_VARIABLES_STYLES = `
  .drag-variable-wrapper {
    transition: box-shadow 0.15s ease;
  }
  .drag-variable-wrapper:active {
    box-shadow: 0 4px 16px hsl(210 80% 55% / 0.25);
  }
  body.drag-mode-active {
    cursor: default !important;
  }
  body.drag-mode-active * {
    user-select: none !important;
    -webkit-user-select: none !important;
  }
`;

/**
 * Inject drag & resize scripts/styles into contract preview HTML.
 */
export function injectDragVariablesIntoHtml(previewHtml: string, gridSize: number = 8): string {
  let result = previewHtml;

  const gridCSS = `.contract-page, [data-contract-page] { position: relative !important; } .contract-page::after, [data-contract-page]::after { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 50; background-image: linear-gradient(to right, hsl(210 20% 80% / 0.15) 1px, transparent 1px), linear-gradient(to bottom, hsl(210 20% 80% / 0.15) 1px, transparent 1px); background-size: ${gridSize}px ${gridSize}px; background-position: 0 0; }`;

  result = result.replace(
    '</head>',
    `<style>${DRAG_VARIABLES_STYLES}</style>\n<style id="drag-grid-style">${gridCSS}</style>\n</head>`
  );

  const scriptWithGrid = DRAG_VARIABLES_SCRIPT.replace('__GRID_SIZE__', String(gridSize));

  result = result.replace(
    '</body>',
    `<script>${scriptWithGrid}<\/script>\n</body>`
  );

  result = result.replace(
    'class="contract-document-root"',
    'class="contract-document-root drag-mode-active"'
  );

  return result;
}

export interface VariablePosition {
  idx: number;
  varText: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Apply variable positions back into the contract HTML.
 * Wraps each {{variable}} with a span that has positioning via transform.
 */
export function applyVariablePositions(html: string, positions: VariablePosition[]): string {
  if (!positions.length) return html;

  let result = html;
  const sorted = [...positions].sort((a, b) => b.idx - a.idx);

  const varRegex = /\{\{[^}]+\}\}/g;
  const matches: { match: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = varRegex.exec(result)) !== null) {
    matches.push({ match: m[0], index: m.index });
  }

  for (const pos of sorted) {
    const matchInfo = matches[pos.idx];
    if (!matchInfo || matchInfo.match !== pos.varText) continue;

    const styled = `<span data-var-positioned="true" style="position:relative;display:inline-block;transform:translate(${pos.left}px,${pos.top}px);z-index:10;">${matchInfo.match}</span>`;
    result = result.slice(0, matchInfo.index) + styled + result.slice(matchInfo.index + matchInfo.match.length);
  }

  return result;
}
