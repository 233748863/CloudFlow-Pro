export async function measurePortalContent(scope) {
  return scope.evaluate(element => {
    const content = element.matches('main') ? element.querySelector('.portal-card') : element;
    if (!content) return { valid: false, reason: 'content-card-absent' };
    const bounds = content.getBoundingClientRect();
    const violations = [];
    const inside = box => box.left >= bounds.left - 1 && box.right <= bounds.right + 1
      && box.left >= -1 && box.right <= innerWidth + 1;
    for (const item of [content, ...content.querySelectorAll('article,section,dl,fieldset,button')]) {
      if (!item.getClientRects().length) continue;
      const box = item.getBoundingClientRect();
      if (!inside(box) || item.scrollWidth > item.clientWidth + 1) {
        violations.push({ tag: item.tagName, left: box.left, right: box.right, scroll: item.scrollWidth, available: item.clientWidth });
      }
    }
    let textLines = 0;
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim() || node.parentElement.closest('.sr-only,[hidden],[aria-hidden="true"]')) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const line of range.getClientRects()) {
        if (!line.width || !line.height) continue;
        textLines++;
        if (!inside(line)) violations.push({ tag: 'text', left: line.left, right: line.right });
      }
    }
    return { valid: bounds.width > 0 && inside(bounds) && textLines > 0 && violations.length === 0,
      left: bounds.left, right: bounds.right, viewport: innerWidth, textLines, violationCount: violations.length, violations: violations.slice(0, 12) };
  });
}

export async function measurePortalControls(locator) {
  const controls = await locator.evaluateAll(elements => elements.map(element => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    const pointerEvents = getComputedStyle(element).pointerEvents;
    const unobscured = hit === element || element.contains(hit)
      || pointerEvents === 'none' && !!hit?.contains(element);
    return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom,
      width: bounds.width, height: bounds.height, pointerEvents, disabled: element.matches(':disabled'),
      fullyVisible: bounds.width > 0 && bounds.height > 0 && bounds.top >= 0 && bounds.bottom <= innerHeight
        && bounds.left >= 0 && bounds.right <= innerWidth && unobscured };
  }));
  return { allVisible: controls.length > 0 && controls.every(control => control.fullyVisible), controls };
}
