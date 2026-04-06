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
  var ALL_VARIABLES = __ALL_VARIABLES__;
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

  function createVariableListPanel() {
    var panel = document.createElement('div');
    panel.id = 'var-list-panel';
    panel.style.cssText = 'display:none;position:fixed;z-index:10000;background:#fff;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.18);width:260px;max-height:400px;font-family:system-ui,sans-serif;font-size:13px;overflow:hidden;';

    var header = document.createElement('div');
    header.style.cssText = 'padding:10px 12px;font-weight:600;font-size:13px;color:#1e293b;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;';
    header.innerHTML = '<span>Variáveis disponíveis</span>';
    var closeBtn = document.createElement('span');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'cursor:pointer;color:#94a3b8;font-size:16px;line-height:1;';
    closeBtn.addEventListener('click', function() { panel.style.display = 'none'; });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    var searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.placeholder = 'Buscar variável...';
    searchBox.style.cssText = 'width:100%;padding:8px 12px;border:none;border-bottom:1px solid #e5e7eb;outline:none;font-size:12px;box-sizing:border-box;';
    panel.appendChild(searchBox);

    var listContainer = document.createElement('div');
    listContainer.style.cssText = 'overflow-y:auto;max-height:300px;padding:4px 0;';
    panel.appendChild(listContainer);

    var sorted = ALL_VARIABLES.slice().sort(function(a, b) { return a.var.localeCompare(b.var); });

    function renderList(filter) {
      listContainer.innerHTML = '';
      var items = filter ? sorted.filter(function(v) { return v.var.toLowerCase().indexOf(filter.toLowerCase()) >= 0 || v.desc.toLowerCase().indexOf(filter.toLowerCase()) >= 0; }) : sorted;
      items.forEach(function(v) {
        var item = document.createElement('div');
        item.setAttribute('draggable', 'true');
        item.style.cssText = 'padding:6px 12px;cursor:grab;transition:background 0.1s;border-bottom:1px solid #f1f5f9;';
        item.innerHTML = '<div style="font-size:12px;font-weight:500;color:#2563eb;font-family:monospace;">' + v.var + '</div><div style="font-size:11px;color:#64748b;margin-top:1px;">' + v.desc + '</div>';
        item.addEventListener('mouseenter', function() { item.style.background = '#f0f9ff'; });
        item.addEventListener('mouseleave', function() { item.style.background = 'transparent'; });
        item.addEventListener('dragstart', function(e) {
          e.dataTransfer.setData('text/plain', v.var);
          e.dataTransfer.effectAllowed = 'copy';
          panel.style.display = 'none';
        });
        item.addEventListener('dragend', function(e) {
          if (e.dataTransfer.dropEffect !== 'none') return;
          // If dropped inside iframe area, compute position
          var page = document.querySelector('.contract-page') || document.body;
          if (!page) return;
          var pageRect = page.getBoundingClientRect();
          var x = e.clientX;
          var y = e.clientY;
          if (x >= pageRect.left && x <= pageRect.right && y >= pageRect.top && y <= pageRect.bottom) {
            handleDropVariable(v.var, x, y);
          }
        });
        listContainer.appendChild(item);
      });
      if (items.length === 0) {
        var empty = document.createElement('div');
        empty.style.cssText = 'padding:12px;text-align:center;color:#94a3b8;font-size:12px;';
        empty.textContent = 'Nenhuma variável encontrada';
        listContainer.appendChild(empty);
      }
    }

    searchBox.addEventListener('input', function() { renderList(searchBox.value); });
    renderList('');

    document.body.appendChild(panel);
    return panel;
  }

  var varListPanel = null;

  function showEditModal(targetEl) {
    var currentText = targetEl.getAttribute('data-var-text') || '';
    // Backdrop
    var backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:99998;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.15s ease;';
    // Modal
    var modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.25);padding:24px;width:380px;max-width:90vw;font-family:system-ui,sans-serif;animation:scaleIn 0.15s ease;';
    // Title
    var title = document.createElement('div');
    title.textContent = 'Editar variável';
    title.style.cssText = 'font-size:16px;font-weight:600;color:#1e293b;margin-bottom:4px;';
    modal.appendChild(title);
    // Subtitle
    var sub = document.createElement('div');
    sub.textContent = 'Altere o texto da variável exibida no contrato.';
    sub.style.cssText = 'font-size:12px;color:#94a3b8;margin-bottom:16px;';
    modal.appendChild(sub);
    // Label
    var label = document.createElement('div');
    label.textContent = 'Texto da variável';
    label.style.cssText = 'font-size:12px;font-weight:500;color:#475569;margin-bottom:6px;';
    modal.appendChild(label);
    // Input
    var input = document.createElement('input');
    input.type = 'text';
    input.value = currentText;
    input.style.cssText = 'width:100%;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px;font-family:monospace;color:#1e293b;outline:none;box-sizing:border-box;transition:border-color 0.15s;';
    input.addEventListener('focus', function() { input.style.borderColor = '#3b82f6'; });
    input.addEventListener('blur', function() { setTimeout(function() { input.style.borderColor = '#e2e8f0'; }, 100); });
    modal.appendChild(input);

    // Variable dropdown
    var dropLabel = document.createElement('div');
    dropLabel.textContent = 'Ou selecione uma variável';
    dropLabel.style.cssText = 'font-size:12px;font-weight:500;color:#475569;margin-top:12px;margin-bottom:6px;';
    modal.appendChild(dropLabel);

    var searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Buscar variável...';
    searchInput.style.cssText = 'width:100%;padding:8px 10px;border:1.5px solid #e2e8f0;border-radius:8px 8px 0 0;font-size:12px;color:#1e293b;outline:none;box-sizing:border-box;border-bottom:none;';
    modal.appendChild(searchInput);

    var varList = document.createElement('div');
    varList.style.cssText = 'max-height:150px;overflow-y:auto;border:1.5px solid #e2e8f0;border-radius:0 0 8px 8px;box-sizing:border-box;';

    var sorted = ALL_VARIABLES.slice().sort(function(a, b) { return a.var.localeCompare(b.var); });

    function renderVarList(filter) {
      varList.innerHTML = '';
      var items = filter ? sorted.filter(function(v) { return v.var.toLowerCase().indexOf(filter.toLowerCase()) >= 0 || v.desc.toLowerCase().indexOf(filter.toLowerCase()) >= 0; }) : sorted;
      items.forEach(function(v) {
        var item = document.createElement('div');
        item.style.cssText = 'padding:6px 10px;cursor:pointer;transition:background 0.1s;border-bottom:1px solid #f1f5f9;';
        item.innerHTML = '<div style="font-size:12px;font-family:monospace;color:#2563eb;">' + v.var + '</div><div style="font-size:10px;color:#94a3b8;">' + v.desc + '</div>';
        item.addEventListener('mouseenter', function() { item.style.background = '#f0f9ff'; });
        item.addEventListener('mouseleave', function() { item.style.background = '#fff'; });
        item.addEventListener('click', function() {
          input.value = v.var;
          input.style.borderColor = '#3b82f6';
        });
        varList.appendChild(item);
      });
      if (items.length === 0) {
        var empty = document.createElement('div');
        empty.style.cssText = 'padding:10px;text-align:center;color:#94a3b8;font-size:11px;';
        empty.textContent = 'Nenhuma variável encontrada';
        varList.appendChild(empty);
      }
    }

    searchInput.addEventListener('input', function() { renderVarList(searchInput.value); });
    renderVarList('');
    modal.appendChild(varList);

    // Buttons
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:20px;';
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.style.cssText = 'padding:8px 16px;border-radius:8px;border:1.5px solid #e2e8f0;background:#fff;color:#64748b;font-size:13px;font-weight:500;cursor:pointer;transition:background 0.1s;';
    cancelBtn.addEventListener('mouseenter', function() { cancelBtn.style.background = '#f8fafc'; });
    cancelBtn.addEventListener('mouseleave', function() { cancelBtn.style.background = '#fff'; });
    cancelBtn.addEventListener('click', function() { backdrop.remove(); document.removeEventListener('keydown', keyHandler); });
    var saveBtn = document.createElement('button');
    saveBtn.textContent = 'Salvar';
    saveBtn.style.cssText = 'padding:8px 20px;border-radius:8px;border:none;background:#3b82f6;color:#fff;font-size:13px;font-weight:500;cursor:pointer;transition:background 0.1s;';
    saveBtn.addEventListener('mouseenter', function() { saveBtn.style.background = '#2563eb'; });
    saveBtn.addEventListener('mouseleave', function() { saveBtn.style.background = '#3b82f6'; });
    saveBtn.addEventListener('click', function() {
      var newText = input.value.trim();
      if (newText) {
        targetEl.setAttribute('data-var-text', newText);
        var inner = targetEl.querySelector('.drag-variable-inner');
        if (inner) inner.textContent = newText;
        notifyPositionChange(targetEl);
      }
      backdrop.remove();
      document.removeEventListener('keydown', keyHandler);
    });
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);
    modal.appendChild(btnRow);
    backdrop.appendChild(modal);
    backdrop.addEventListener('click', function(e) { if (e.target === backdrop) { backdrop.remove(); document.removeEventListener('keydown', keyHandler); } });
    var keyHandler = function(e) {
      if (e.key === 'Escape') { backdrop.remove(); document.removeEventListener('keydown', keyHandler); }
      if (e.key === 'Enter') { saveBtn.click(); }
    };
    document.addEventListener('keydown', keyHandler);
    if (!document.getElementById('edit-modal-anim')) {
      var animStyle = document.createElement('style');
      animStyle.id = 'edit-modal-anim';
      animStyle.textContent = '@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes scaleIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}';
      document.head.appendChild(animStyle);
    }
    document.body.appendChild(backdrop);
    setTimeout(function() { input.focus(); input.select(); }, 50);
  }


  function createContextMenu() {
    var menu = document.createElement('div');
    menu.id = 'var-context-menu';
    menu.style.cssText = 'display:none;position:fixed;z-index:9999;background:#fff;border:1px solid #d1d5db;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:4px 0;min-width:160px;font-family:system-ui,sans-serif;font-size:13px;';

    var listBtn = document.createElement('div');
    listBtn.textContent = '📋 Lista de variáveis';
    listBtn.style.cssText = 'padding:6px 12px;cursor:pointer;color:#1e293b;transition:background 0.1s;';
    listBtn.addEventListener('mouseenter', function() { listBtn.style.background = '#f1f5f9'; });
    listBtn.addEventListener('mouseleave', function() { listBtn.style.background = 'transparent'; });
    listBtn.addEventListener('click', function() {
      if (!varListPanel) varListPanel = createVariableListPanel();
      varListPanel.style.display = 'block';
      varListPanel.style.left = Math.min(parseInt(menu.style.left), window.innerWidth - 280) + 'px';
      varListPanel.style.top = Math.min(parseInt(menu.style.top), window.innerHeight - 420) + 'px';
      menu.style.display = 'none';
    });
    menu.appendChild(listBtn);

    var editBtn = document.createElement('div');
    editBtn.setAttribute('data-var-action', 'true');
    editBtn.textContent = '✏️ Editar texto';
    editBtn.style.cssText = 'padding:6px 12px;cursor:pointer;color:#1e293b;transition:background 0.1s;';
    editBtn.addEventListener('mouseenter', function() { editBtn.style.background = '#f1f5f9'; });
    editBtn.addEventListener('mouseleave', function() { editBtn.style.background = 'transparent'; });
    editBtn.addEventListener('click', function() {
      if (menu._targetEl) {
        showEditModal(menu._targetEl);
      }
      menu.style.display = 'none';
    });
    menu.appendChild(editBtn);

    var sep0 = document.createElement('div');
    sep0.style.cssText = 'height:1px;background:#e5e7eb;margin:4px 0;';
    sep0.setAttribute('data-var-action', 'true');
    menu.appendChild(sep0);

    var duplicateBtn = document.createElement('div');
    duplicateBtn.setAttribute('data-var-action', 'true');
    duplicateBtn.textContent = 'Duplicar variável';
    duplicateBtn.style.cssText = 'padding:6px 12px;cursor:pointer;color:#2563eb;transition:background 0.1s;';
    duplicateBtn.addEventListener('mouseenter', function() { duplicateBtn.style.background = '#dbeafe'; });
    duplicateBtn.addEventListener('mouseleave', function() { duplicateBtn.style.background = 'transparent'; });
    duplicateBtn.addEventListener('click', function() {
      if (menu._targetEl) {
        var varText = menu._targetEl.getAttribute('data-var-text');
        var isAbs = menu._targetEl.getAttribute('data-pos-mode') === 'absolute';
        var offsetLeft = isAbs ? (parseFloat(menu._targetEl.style.left) || 0) + 20 : (parseFloat(menu._targetEl.getAttribute('data-tx')) || 0) + 20;
        var offsetTop = isAbs ? (parseFloat(menu._targetEl.style.top) || 0) + 20 : (parseFloat(menu._targetEl.getAttribute('data-ty')) || 0) + 20;
        if (isAbs) {
          handleDropVariable(varText, offsetLeft + (menu._targetEl.closest('.contract-page') || document.body).getBoundingClientRect().left, offsetTop + (menu._targetEl.closest('.contract-page') || document.body).getBoundingClientRect().top);
        } else {
          var rect = menu._targetEl.getBoundingClientRect();
          var page = document.querySelector('.contract-page') || document.body;
          var pageRect = page.getBoundingClientRect();
          handleDropVariable(varText, rect.left - pageRect.left + 20 + pageRect.left, rect.top - pageRect.top + 20 + pageRect.top);
        }
      }
      menu.style.display = 'none';
    });
    menu.appendChild(duplicateBtn);

    var sep = document.createElement('div');
    sep.setAttribute('data-var-action', 'true');
    sep.style.cssText = 'height:1px;background:#e5e7eb;margin:4px 0;';
    menu.appendChild(sep);

    var removeBtn = document.createElement('div');
    removeBtn.setAttribute('data-var-action', 'true');
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
    document.addEventListener('click', function(e) { if (!menu.contains(e.target)) menu.style.display = 'none'; });
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
      // Show variable-specific options
      var items = contextMenu.querySelectorAll('[data-var-action]');
      items.forEach(function(el) { el.style.display = 'block'; });
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
      attachContextMenu(wrapper);

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

    // Page-level dragover/drop for variables dragged from the list panel
    document.addEventListener('dragover', function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    document.addEventListener('drop', function(e) {
      e.preventDefault();
      var varText = e.dataTransfer.getData('text/plain');
      if (!varText || varText.indexOf('{{') !== 0) return;
      handleDropVariable(varText, e.clientX, e.clientY);
    });

    // Page-level right-click to open variable list
    document.addEventListener('contextmenu', function(e) {
      if (e.target.closest && e.target.closest('.drag-variable-wrapper')) return;
      e.preventDefault();
      if (!contextMenu) contextMenu = createContextMenu();
      contextMenu._targetEl = null;
      contextMenu.style.display = 'block';
      contextMenu.style.left = e.clientX + 'px';
      contextMenu.style.top = e.clientY + 'px';
      // Hide variable-specific options when clicking empty area
      var items = contextMenu.querySelectorAll('[data-var-action]');
      items.forEach(function(el) { el.style.display = contextMenu._targetEl ? 'block' : 'none'; });
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
    attachContextMenu(wrapper);

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
export function injectDragVariablesIntoHtml(previewHtml: string, gridSize: number = 8, variables?: { var: string; desc: string }[]): string {
  let result = previewHtml;

  const gridCSS = `.contract-page, [data-contract-page] { position: relative !important; } .contract-page::after, [data-contract-page]::after { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 50; background-image: linear-gradient(to right, hsl(210 20% 80% / 0.15) 1px, transparent 1px), linear-gradient(to bottom, hsl(210 20% 80% / 0.15) 1px, transparent 1px); background-size: ${gridSize}px ${gridSize}px; background-position: 0 0; }`;

  result = result.replace(
    '</head>',
    `<style>${DRAG_VARIABLES_STYLES}</style>\n<style id="drag-grid-style">${gridCSS}</style>\n</head>`
  );

  const varsJson = JSON.stringify(variables || []);
  const scriptWithGrid = DRAG_VARIABLES_SCRIPT
    .replace('__GRID_SIZE__', String(gridSize))
    .replace('__ALL_VARIABLES__', varsJson);

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
