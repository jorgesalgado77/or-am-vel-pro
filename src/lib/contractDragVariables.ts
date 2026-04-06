/**
 * Injects drag & resize logic for {{variables}} inside a contract preview iframe.
 * Variables become absolutely positioned, draggable, and resizable elements.
 * Changes are communicated back via postMessage.
 */

const DRAG_VARIABLES_SCRIPT = `
(function() {
  const HANDLE_SIZE = 8;
  let GRID_SIZE = __GRID_SIZE__; // snap-to-grid in pixels (updated via message)
  function snap(v) { return Math.round(v / GRID_SIZE) * GRID_SIZE; }
  function buildGridCSS(size) {
    return '.contract-page, [data-contract-page] { background-image: linear-gradient(to right, hsl(210 20% 80% / 0.15) 1px, transparent 1px), linear-gradient(to bottom, hsl(210 20% 80% / 0.15) 1px, transparent 1px) !important; background-size: ' + size + 'px ' + size + 'px !important; background-position: 0 0 !important; }';
  }
  let activeEl = null;
  let dragState = null; // { type: 'move'|'resize', startX, startY, startLeft, startTop, startW, startH }

  function initDragVariables() {
    const marks = document.querySelectorAll('mark[data-placeholder-highlight]');
    marks.forEach((mark, idx) => {
      // Get current position relative to the page
      const page = mark.closest('.contract-page') || mark.closest('body');
      if (!page) return;

      const varText = mark.textContent || '';
      
      // Create wrapper
      const wrapper = document.createElement('span');
      wrapper.className = 'drag-variable-wrapper';
      wrapper.setAttribute('data-var-idx', idx.toString());
      wrapper.setAttribute('data-var-text', varText);
      wrapper.setAttribute('draggable', 'false');
      
      // Check if this variable already has inline position (from previous drag)
      const existingStyle = mark.getAttribute('style') || '';
      const hasPosition = /position\s*:\s*absolute/i.test(existingStyle);
      
      if (hasPosition) {
        wrapper.setAttribute('style', existingStyle);
      } else {
        // Calculate position relative to page
        const pageRect = page.getBoundingClientRect();
        const markRect = mark.getBoundingClientRect();
        const left = markRect.left - pageRect.left;
        const top = markRect.top - pageRect.top;
        
        wrapper.style.position = 'absolute';
        wrapper.style.left = left + 'px';
        wrapper.style.top = top + 'px';
      }

      wrapper.style.cursor = 'move';
      wrapper.style.zIndex = '100';
      wrapper.style.display = 'inline-block';
      wrapper.style.minWidth = '40px';
      wrapper.style.minHeight = '20px';
      wrapper.style.userSelect = 'none';
      wrapper.style.webkitUserSelect = 'none';

      // Inner content
      const inner = document.createElement('span');
      inner.className = 'drag-variable-inner';
      inner.style.cssText = 'display:inline-block;background:hsl(210 80% 55%/0.15);color:hsl(210 80% 45%);border:2px dashed hsl(210 80% 55%/0.5);border-radius:4px;padding:2px 6px;font-family:monospace;font-size:0.9em;white-space:nowrap;pointer-events:none;width:100%;height:100%;box-sizing:border-box;';
      inner.textContent = varText;
      wrapper.appendChild(inner);

      // Resize handle (bottom-right corner)
      const resizeHandle = document.createElement('span');
      resizeHandle.className = 'drag-variable-resize';
      resizeHandle.style.cssText = 'position:absolute;bottom:-' + (HANDLE_SIZE/2) + 'px;right:-' + (HANDLE_SIZE/2) + 'px;width:' + HANDLE_SIZE + 'px;height:' + HANDLE_SIZE + 'px;background:hsl(210 80% 55%);border-radius:2px;cursor:nwse-resize;z-index:101;opacity:0;transition:opacity 0.15s;';
      wrapper.appendChild(resizeHandle);

      // Show resize handle on hover
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

      // Make the page position relative for absolute children
      if (page.style) {
        page.style.position = 'relative';
      }

      // Replace the mark with the wrapper
      mark.parentNode.replaceChild(wrapper, mark);

      // Drag: move
      wrapper.addEventListener('mousedown', (e) => {
        if (e.target === resizeHandle) return;
        e.preventDefault();
        e.stopPropagation();
        activeEl = wrapper;
        dragState = {
          type: 'move',
          startX: e.clientX,
          startY: e.clientY,
          startLeft: parseFloat(wrapper.style.left) || 0,
          startTop: parseFloat(wrapper.style.top) || 0,
        };
        wrapper.style.zIndex = '200';
        wrapper.style.opacity = '0.85';
      });

      // Resize
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
    });

    // Global mouse handlers
    document.addEventListener('mousemove', (e) => {
      if (!activeEl || !dragState) return;
      e.preventDefault();

      if (dragState.type === 'move') {
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        activeEl.style.left = snap(dragState.startLeft + dx) + 'px';
        activeEl.style.top = snap(dragState.startTop + dy) + 'px';
      } else if (dragState.type === 'resize') {
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        const newW = Math.max(40, snap(dragState.startW + dx));
        const newH = Math.max(20, snap(dragState.startH + dy));
        activeEl.style.width = newW + 'px';
        activeEl.style.height = newH + 'px';
      }
    });

    document.addEventListener('mouseup', () => {
      if (activeEl && dragState) {
        activeEl.style.zIndex = '100';
        activeEl.style.opacity = '1';
        // Notify parent
        notifyPositionChange(activeEl);
        activeEl = null;
        dragState = null;
      }
    });
  }

  function notifyPositionChange(el) {
    const idx = parseInt(el.getAttribute('data-var-idx'), 10);
    const varText = el.getAttribute('data-var-text');
    const left = parseFloat(el.style.left) || 0;
    const top = parseFloat(el.style.top) || 0;
    const width = el.offsetWidth;
    const height = el.offsetHeight;

    window.parent.postMessage({
      type: 'variable-position-change',
      idx,
      varText,
      left,
      top,
      width,
      height,
    }, '*');
  }

  // Collect all positions and send them
  function collectAllPositions() {
    const wrappers = document.querySelectorAll('.drag-variable-wrapper');
    const positions = [];
    wrappers.forEach((el) => {
      positions.push({
        idx: parseInt(el.getAttribute('data-var-idx'), 10),
        varText: el.getAttribute('data-var-text'),
        left: parseFloat(el.style.left) || 0,
        top: parseFloat(el.style.top) || 0,
        width: el.offsetWidth,
        height: el.offsetHeight,
      });
    });
    window.parent.postMessage({ type: 'all-variable-positions', positions }, '*');
  }

  // Listen for requests from parent
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'get-all-positions') {
      collectAllPositions();
    } else if (e.data?.type === 'drop-variable') {
      handleDropVariable(e.data.varText, e.data.x, e.data.y);
    } else if (e.data?.type === 'set-grid-size') {
      GRID_SIZE = e.data.gridSize || 8;
      // Update CSS grid overlay
      const style = document.getElementById('drag-grid-style');
      if (style) {
        style.textContent = buildGridCSS(GRID_SIZE);
      }
    }
  });

  function handleDropVariable(varText, x, y) {
    // Find the first contract-page or body to place the variable
    const page = document.querySelector('.contract-page') || document.body;
    if (!page) return;
    page.style.position = 'relative';

    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    const pageRect = page.getBoundingClientRect();
    const left = x - pageRect.left;
    const top = y - pageRect.top + scrollTop;

    // Count existing wrappers for new idx
    const existing = document.querySelectorAll('.drag-variable-wrapper');
    const idx = existing.length;

    const wrapper = document.createElement('span');
    wrapper.className = 'drag-variable-wrapper';
    wrapper.setAttribute('data-var-idx', idx.toString());
    wrapper.setAttribute('data-var-text', varText);
    wrapper.setAttribute('draggable', 'false');
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

    const inner = document.createElement('span');
    inner.className = 'drag-variable-inner';
    inner.style.cssText = 'display:inline-block;background:hsl(210 80% 55%/0.15);color:hsl(210 80% 45%);border:2px dashed hsl(210 80% 55%/0.5);border-radius:4px;padding:2px 6px;font-family:monospace;font-size:0.9em;white-space:nowrap;pointer-events:none;width:100%;height:100%;box-sizing:border-box;';
    inner.textContent = varText;
    wrapper.appendChild(inner);

    const resizeHandle = document.createElement('span');
    resizeHandle.className = 'drag-variable-resize';
    resizeHandle.style.cssText = 'position:absolute;bottom:-' + (HANDLE_SIZE/2) + 'px;right:-' + (HANDLE_SIZE/2) + 'px;width:' + HANDLE_SIZE + 'px;height:' + HANDLE_SIZE + 'px;background:hsl(210 80% 55%);border-radius:2px;cursor:nwse-resize;z-index:101;opacity:0;transition:opacity 0.15s;';
    wrapper.appendChild(resizeHandle);

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

    wrapper.addEventListener('mousedown', (ev) => {
      if (ev.target === resizeHandle) return;
      ev.preventDefault();
      ev.stopPropagation();
      activeEl = wrapper;
      dragState = {
        type: 'move',
        startX: ev.clientX,
        startY: ev.clientY,
        startLeft: parseFloat(wrapper.style.left) || 0,
        startTop: parseFloat(wrapper.style.top) || 0,
      };
      wrapper.style.zIndex = '200';
      wrapper.style.opacity = '0.85';
    });

    resizeHandle.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      activeEl = wrapper;
      dragState = {
        type: 'resize',
        startX: ev.clientX,
        startY: ev.clientY,
        startW: wrapper.offsetWidth,
        startH: wrapper.offsetHeight,
      };
    });

    page.appendChild(wrapper);

    // Notify parent of new variable
    window.parent.postMessage({
      type: 'variable-dropped',
      varText,
      idx,
      left,
      top,
      width: wrapper.offsetWidth,
      height: wrapper.offsetHeight,
    }, '*');

    notifyPositionChange(wrapper);
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDragVariables);
  } else {
    // Small delay to ensure highlight script has run
    setTimeout(initDragVariables, 100);
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
  // Insert styles before </head> and script before </body>
  let result = previewHtml;

  result = result.replace(
    '</head>',
    `<style>${DRAG_VARIABLES_STYLES}</style>\n</head>`
  );

  result = result.replace(
    '</body>',
    `<script>${DRAG_VARIABLES_SCRIPT}<\/script>\n</body>`
  );

  // Add class to body
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
 * Wraps each {{variable}} with a span that has absolute positioning.
 */
export function applyVariablePositions(html: string, positions: VariablePosition[]): string {
  if (!positions.length) return html;

  let result = html;
  // Process in reverse order of idx to avoid offset issues
  const sorted = [...positions].sort((a, b) => b.idx - a.idx);

  // Find all {{...}} occurrences
  const varRegex = /\{\{[^}]+\}\}/g;
  const matches: { match: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = varRegex.exec(result)) !== null) {
    matches.push({ match: m[0], index: m.index });
  }

  for (const pos of sorted) {
    const matchInfo = matches[pos.idx];
    if (!matchInfo || matchInfo.match !== pos.varText) continue;

    const styled = `<span data-var-positioned="true" style="position:absolute;left:${pos.left}px;top:${pos.top}px;width:${pos.width}px;height:${pos.height}px;display:inline-block;z-index:10;">${matchInfo.match}</span>`;
    result = result.slice(0, matchInfo.index) + styled + result.slice(matchInfo.index + matchInfo.match.length);
  }

  return result;
}
