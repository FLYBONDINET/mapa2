/**
 * Card auto-layout to minimize overlaps inside the map container.
 * Simple iterative resolver: for each pair with overlap, push them apart.
 */
window.Layout = (() => {

  function rect(el){
    const r = el.getBoundingClientRect();
    return { x:r.left, y:r.top, w:r.width, h:r.height };
  }
  function overlap(a,b){
    return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
  }
  function center(r){ return { x:r.x + r.w/2, y:r.y + r.h/2 }; }

  function autoLayout(cards, containerEl){
    if(!cards.length) return;

    const cont = containerEl.getBoundingClientRect();
    // limit iterations for performance
    for(let iter=0; iter<40; iter++){
      let moved = false;

      for(let i=0; i<cards.length; i++){
        for(let j=i+1; j<cards.length; j++){
          const aEl = cards[i], bEl = cards[j];
          const a = rect(aEl), b = rect(bEl);
          if(!overlap(a,b)) continue;

          const ca = center(a), cb = center(b);
          let dx = ca.x - cb.x;
          let dy = ca.y - cb.y;
          const dist = Math.hypot(dx,dy) || 1;
          dx/=dist; dy/=dist;

          // push strength
          const push = 6;
          const ax = (parseFloat(aEl.dataset.x)||0) + dx*push;
          const ay = (parseFloat(aEl.dataset.y)||0) + dy*push;
          const bx = (parseFloat(bEl.dataset.x)||0) - dx*push;
          const by = (parseFloat(bEl.dataset.y)||0) - dy*push;

          aEl.dataset.x = ax; aEl.dataset.y = ay;
          bEl.dataset.x = bx; bEl.dataset.y = by;
          applyTransform(aEl); applyTransform(bEl);
          moved = true;
        }
      }

      // keep inside container
      for(const el of cards){
        const r = rect(el);
        let x = parseFloat(el.dataset.x)||0;
        let y = parseFloat(el.dataset.y)||0;
        if(r.left < cont.left) x += (cont.left - r.left) + 6;
        if(r.top < cont.top) y += (cont.top - r.top) + 6;
        if(r.right > cont.right) x -= (r.right - cont.right) + 6;
        if(r.bottom > cont.bottom) y -= (r.bottom - cont.bottom) + 6;
        el.dataset.x = x; el.dataset.y = y;
        applyTransform(el);
      }

      if(!moved) break;
    }
  }

  function applyTransform(el){
    const x = parseFloat(el.dataset.x)||0;
    const y = parseFloat(el.dataset.y)||0;
    el.style.transform = `translate(${x}px, ${y}px)`;
  }

  return { autoLayout, applyTransform };
})();
