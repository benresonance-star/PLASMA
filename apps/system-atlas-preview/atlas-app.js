import { loadAtlas, parseHash, routeForRef, routeForSelection } from './atlas-model.js';
import { createRenderer } from './atlas-renderer.js';
import { setupHelp } from './atlas-help.js';

const $ = selector => document.querySelector(selector);
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

async function boot() {
  const model = await loadAtlas();

  const els = {
    tabs: $('#viewTabs'),
    viewTitle: $('#viewTitle'),
    viewSubtitle: $('#viewSubtitle'),
    viewControls: $('#viewControls'),
    viewHost: $('#viewHost'),
    inspector: $('#inspector'),
    indexHost: $('#atlasIndex'),
    status: $('#foundationStatus'),
    searchInput: $('#atlasSearch'),
    searchResults: $('#searchResults'),
    themeToggle: $('#themeToggle'),
    themeLabel: $('#themeLabel'),
    navToggle: $('#navToggle'),
    inspectorToggle: $('#inspectorToggle'),
    zoomOut: $('#zoomOut'),
    zoomIn: $('#zoomIn'),
    zoomReset: $('#zoomReset'),
    zoomFit: $('#zoomFit'),
    zoomLabel: $('#zoomLabel'),
    helpLauncher: $('#helpLauncher'),
    helpPanel: $('#helpPanel'),
    helpTitle: $('#helpTitle'),
    helpText: $('#helpText'),
    helpStatus: $('#helpStatus'),
    helpPlay: $('#helpPlay'),
    helpStop: $('#helpStop'),
    helpClose: $('#helpClose')
  };

  els.status.textContent = model.data.meta.status.replaceAll('-',' ');
  els.tabs.innerHTML = model.data.views.map(view =>
    `<a class="view-tab" data-view="${view.id}" href="#${view.id}">${view.label}</a>`
  ).join('');

  const renderer = createRenderer({
    model,
    viewHost: els.viewHost,
    inspector: els.inspector,
    indexHost: els.indexHost
  });

  setupHelp({
    model,
    launcher: els.helpLauncher,
    panel: els.helpPanel,
    title: els.helpTitle,
    text: els.helpText,
    status: els.helpStatus,
    play: els.helpPlay,
    stop: els.helpStop,
    close: els.helpClose
  });

  const state = {
    route: parseHash(location.hash),
    showRelationships: localStorage.getItem('plasma-atlas-relationships') !== 'off',
    sheetZoom: Number(localStorage.getItem('plasma-atlas-sheet-zoom')) || 1
  };

  function currentViewMeta() {
    return model.data.views.find(v => v.id === state.route.view) || model.data.views[0];
  }

  function selectedRef() {
    return state.route.type && state.route.id ? model.resolve(state.route.type,state.route.id) : null;
  }

  function renderControls() {
    if (state.route.view === 'overview') {
      els.viewControls.innerHTML = `
        <button class="tool ${state.showRelationships?'active':''}" type="button" id="relationshipsToggle">Relationships</button>
        <span class="toolbar-note">Click a line card to inspect its typed contract</span>`;
      $('#relationshipsToggle')?.addEventListener('click', () => {
        state.showRelationships = !state.showRelationships;
        localStorage.setItem('plasma-atlas-relationships', state.showRelationships ? 'on' : 'off');
        render();
      });
    } else if (state.route.view === 'integration') {
      els.viewControls.innerHTML = `<span class="toolbar-note">Search includes connected slices, languages, contracts and evidence.</span>`;
    } else if (state.route.view === 'evidence') {
      els.viewControls.innerHTML = `<span class="toolbar-note">Unlinked evidence is shown as unknown, never verified.</span>`;
    } else if (state.route.view === 'slices') {
      els.viewControls.innerHTML = `<span class="toolbar-note">No implementation percentages without linked evidence.</span>`;
    } else {
      els.viewControls.innerHTML = '';
    }
  }

  function applySheetZoom() {
    const stage = els.viewHost.querySelector('.view-stage');
    if (!stage) return;
    stage.style.zoom = state.sheetZoom;
    els.zoomLabel.textContent = `${Math.round(state.sheetZoom*100)}%`;
    localStorage.setItem('plasma-atlas-sheet-zoom', String(state.sheetZoom));
    requestAnimationFrame(() => {
      if (state.route.view === 'overview') renderer.drawRelationships(state.showRelationships,state.route);
    });
  }

  function setZoom(next) {
    state.sheetZoom = clamp(Math.round(next*20)/20,.55,1.6);
    applySheetZoom();
  }

  function fitZoom() {
    const stage=els.viewHost.querySelector('.view-stage');
    if(!stage)return;
    const base=Number(stage.dataset.baseWidth)||960;
    const available=Math.max(300,els.viewHost.clientWidth-28);
    setZoom(clamp(available/base,.55,1));
  }

  function updateTabs() {
    els.tabs.querySelectorAll('[data-view]').forEach(tab => {
      const active=tab.dataset.view===state.route.view;
      tab.classList.toggle('active',active);
      tab.setAttribute('aria-current',active?'page':'false');
    });
  }

  function render() {
    const meta=currentViewMeta();
    els.viewTitle.textContent=meta.label;
    els.viewSubtitle.textContent=meta.description;
    updateTabs();
    renderControls();
    renderer.renderView(state.route,{showRelationships:state.showRelationships});
    renderer.renderInspector(selectedRef());
    applySheetZoom();
    document.body.classList.toggle('has-selection',Boolean(selectedRef()));
  }

  function navigate(hash) {
    if (location.hash === hash) {
      state.route=parseHash(hash);
      render();
    } else {
      location.hash=hash;
    }
  }

  function closeMobileDrawers() {
    document.body.classList.remove('nav-open','inspector-open');
  }

  document.addEventListener('click', event => {
    if (event.target.closest('.help-ui,.search-shell,.zoom-controls')) return;
    const target=event.target.closest('[data-atlas-type][data-atlas-id]');
    if(!target)return;
    const type=target.dataset.atlasType,id=target.dataset.atlasId;
    const insideIndex=Boolean(target.closest('#atlasIndex'));
    let hash;
    if(insideIndex && type==='component') hash=`#overview/component/${encodeURIComponent(id)}`;
    else if(insideIndex && type==='domainLanguage') hash=`#languages/domain/${encodeURIComponent(id)}`;
    else if(insideIndex && type==='coreLanguage') hash=`#languages/core/${encodeURIComponent(id)}`;
    else hash=routeForSelection(type,id,state.route.view);
    event.preventDefault();
    navigate(hash);
    document.body.classList.remove('nav-open');
  });

  window.addEventListener('hashchange', () => {
    state.route=parseHash(location.hash);
    render();
    els.searchResults.classList.remove('open');
    els.searchInput.value='';
  });

  function showSearchResults(query) {
    const results=model.search(query,10);
    if(!query.trim()){
      els.searchResults.classList.remove('open');
      els.searchResults.innerHTML='';
      return;
    }
    els.searchResults.innerHTML=results.length?results.map(ref=>`
      <a class="search-result" href="${routeForRef(ref)}">
        <span class="search-kind">${ref.type.replace(/([A-Z])/g,' $1')}</span>
        <b>${ref.name}</b>
        <small>${ref.summary}</small>
      </a>`).join(''):`<div class="search-empty">No Atlas items found.</div>`;
    els.searchResults.classList.add('open');
  }

  els.searchInput.addEventListener('input',event=>showSearchResults(event.target.value));
  els.searchInput.addEventListener('keydown',event=>{
    if(event.key==='Escape'){els.searchInput.value='';els.searchResults.classList.remove('open');els.searchInput.blur()}
    if(event.key==='Enter'){
      const first=els.searchResults.querySelector('a');
      if(first){event.preventDefault();navigate(first.getAttribute('href'))}
    }
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='/' && !/input|textarea/i.test(document.activeElement?.tagName||'')){
      event.preventDefault();els.searchInput.focus();
    }
  });
  document.addEventListener('click',event=>{
    if(!event.target.closest('.search-shell'))els.searchResults.classList.remove('open');
  });

  const root=document.documentElement;
  function setTheme(theme){
    root.dataset.theme=theme;
    els.themeLabel.textContent=theme==='dark'?'Light':'Dark';
    localStorage.setItem('plasma-atlas-theme',theme);
    requestAnimationFrame(()=>renderer.drawRelationships(state.showRelationships,state.route));
  }
  const savedTheme=localStorage.getItem('plasma-atlas-theme');
  setTheme(savedTheme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
  els.themeToggle.addEventListener('click',()=>setTheme(root.dataset.theme==='dark'?'light':'dark'));

  els.zoomOut.addEventListener('click',()=>setZoom(state.sheetZoom-.1));
  els.zoomIn.addEventListener('click',()=>setZoom(state.sheetZoom+.1));
  els.zoomReset.addEventListener('click',()=>setZoom(1));
  els.zoomFit.addEventListener('click',fitZoom);

  els.navToggle.addEventListener('click',()=>{
    document.body.classList.toggle('nav-open');
    document.body.classList.remove('inspector-open');
  });
  els.inspectorToggle.addEventListener('click',()=>{
    document.body.classList.toggle('inspector-open');
    document.body.classList.remove('nav-open');
  });

  window.addEventListener('resize',()=>{
    requestAnimationFrame(()=>renderer.drawRelationships(state.showRelationships,state.route));
  });

  if(!location.hash) history.replaceState(null,'','#overview');
  state.route=parseHash(location.hash);
  render();

  // Fit on a narrow first load without scaling the surrounding application shell.
  if(window.innerWidth<900 && !localStorage.getItem('plasma-atlas-sheet-zoom')){
    requestAnimationFrame(fitZoom);
  }

  window.__PLASMA_ATLAS__={model,state,render,navigate,fitZoom};
}

boot().catch(error=>{
  console.error(error);
  const host=document.querySelector('#viewHost');
  if(host)host.innerHTML=`<div class="fatal-error"><h2>Atlas failed to load</h2><p>${String(error.message||error)}</p></div>`;
});
