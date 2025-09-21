// === API with CORS proxy (works in iOS PWA) ===
const ORIGIN = 'https://api.mangadex.org';
const PROXY  = 'https://corsproxy.io/?';
const prox = (url) => PROXY + encodeURIComponent(url);

const el = (s) => document.querySelector(s);
const tpl = (id) => el(id).content.firstElementChild.cloneNode(true);
const $ = {
  results: el('#results'),
  updates: el('#updates'),
  reco: el('#reco'),
  library: el('#library'),
  pages: el('#reader-pages'),
  chapterSelect: el('#chapter-select'),
  reader: el('#reader'),
  readerTitle: el('#reader-title'),
  modeToggle: el('#mode-toggle'),
  markRead: el('#mark-read'),
  modeSelect: el('#reading-mode'),
  langSelect: el('#language-select'),
  adultToggle: el('#adult-toggle'),
  searchForm: el('#search-form'),
  searchInput: el('#search-input'),
  tapLeft: el('#tap-left'),
  tapRight: el('#tap-right'),
};

const state = {
  library: JSON.parse(localStorage.getItem('library') || '[]'),
  mode: localStorage.getItem('mode') || 'swipe',
  lang: localStorage.getItem('lang') || 'en',
  adult: JSON.parse(localStorage.getItem('adult') || 'false')
};
function save(){
  localStorage.setItem('library', JSON.stringify(state.library));
  localStorage.setItem('mode', state.mode);
  localStorage.setItem('lang', state.lang);
  localStorage.setItem('adult', JSON.stringify(state.adult));
}

// Tabs
['home','library','settings'].forEach(name=>{
  el(`#tab-${name}`).addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    el(`#tab-${name}`).classList.add('active');
    el(`#view-${name}`).classList.add('active');
    if (name==='library') renderLibrary();
    if (name==='home') { renderUpdates(); renderRecos(); }
  });
});

// Init settings
$.modeSelect.value = state.mode;
$.langSelect.value = state.lang;
$.adultToggle.checked = state.adult;
$.modeSelect.addEventListener('change',(e)=>{ state.mode = e.target.value; save(); applyReaderMode(); });
$.langSelect.addEventListener('change',(e)=>{ state.lang = e.target.value; save(); if(!$.reader.classList.contains('hidden')) reopenCurrentChapter(); renderUpdates(); renderRecos(); });
$.adultToggle.addEventListener('change',(e)=>{ state.adult = e.target.checked; save(); renderRecos(); });

// Search (proxied)
$.searchForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const q = $.searchInput.value.trim();
  if (!q) return;

  const url = `${ORIGIN}/manga?title=${encodeURIComponent(q)}&limit=20&includes[]=author&includes[]=cover_art`;
  try{
    const res = await fetch(prox(url), { headers: {'accept':'application/json'} });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const items = json.data || [];
    $.results.innerHTML = '';
    if (!items.length){ $.results.innerHTML='<p class="muted">No results.</p>'; return; }
    items.forEach(drawCard);
  }catch(err){
    alert('Search failed: ' + err.message);
    console.error(err);
  }
});

function drawCard(m){
  const card = tpl('#card-tpl');
  const title = m.attributes.title.en || m.attributes.title[Object.keys(m.attributes.title)[0]] || 'Untitled';
  const authorRel = (m.relationships||[]).find(r=>r.type==='author');
  const coverRel  = (m.relationships||[]).find(r=>r.type==='cover_art');
  const fileName  = coverRel?.attributes?.fileName;
  const coverUrl  = fileName ? `https://uploads.mangadex.org/covers/${m.id}/${fileName}.256.jpg` : '';
  card.querySelector('.title').textContent = title;
  card.querySelector('.author').textContent = authorRel?.attributes?.name || '—';
  const img = card.querySelector('.cover'); if (coverUrl){ img.src = coverUrl; img.alt = title; img.onload=()=>img.classList.add('loaded'); }

  card.querySelector('.open').addEventListener('click', ()=> openManga(m.id, title, coverUrl));
  card.querySelector('.follow').addEventListener('click', ()=>{
    if (!state.library.find(x=>x.id===m.id)) state.library.push({id:m.id, title, coverUrl, lastRead:null});
    save(); renderLibrary(); renderUpdates(); renderRecos();
    card.querySelector('.follow').textContent = 'Saved ✓';
  });
  return card;
}

// Library
function renderLibrary(){
  $.library.innerHTML = '';
  if (state.library.length===0){ $.library.innerHTML='<p class="muted">No titles saved yet.</p>'; return; }
  state.library.forEach(item=>{
    const card = tpl('#card-tpl');
    card.querySelector('.title').textContent = item.title;
    card.querySelector('.author').textContent = item.lastRead ? `Last: ch ${item.lastRead.chapter || '?'} p${item.lastRead.page||1}` : '—';
    const img = card.querySelector('.cover'); if (item.coverUrl){ img.src = item.coverUrl; img.alt = item.title; img.onload=()=>img.classList.add('loaded'); }
    card.querySelector('.open').textContent = item.lastRead ? 'Resume' : 'Open';
    card.querySelector('.open').addEventListener('click', ()=> openManga(item.id, item.title, item.coverUrl, item.lastRead?.chapterId, item.lastRead?.page));
    card.querySelector('.follow').textContent = 'Remove';
    card.querySelector('.follow').addEventListener('click', ()=>{
      state.library = state.library.filter(x=>x.id!==item.id);
      save(); renderLibrary(); renderUpdates(); renderRecos();
    });
    $.library.appendChild(card);
  });
}

// Updates (proxied)
async function renderUpdates(){
  const box = $.updates; box.innerHTML='';
  if (state.library.length===0){ box.innerHTML='<p class="muted">Follow titles to see updates here.</p>'; return; }
  for (const item of state.library){
    try{
      const url = `${ORIGIN}/manga/${item.id}/feed?limit=1&translatedLanguage[]=${encodeURIComponent(state.lang)}&order[readableAt]=desc&includes[]=scanlation_group`;
      const feed = await fetch(prox(url)).then(r=>r.json());
      const c = feed.data?.[0];
      if (!c) continue;
      const latestNum = parseFloat(c.attributes.chapter) || 0;
      const lastNum   = parseFloat(item.lastRead?.chapter) || 0;
      const isNew = !item.lastRead || latestNum > lastNum;

      const grp = (c.relationships||[]).find(r=>r.type==='scanlation_group')?.attributes?.name || '';
      const row = document.createElement('div'); row.className='update-item';
      const img = document.createElement('img'); if (item.coverUrl){ img.src = item.coverUrl; img.className='fade'; img.onload=()=>img.classList.add('loaded'); }
      const meta = document.createElement('div'); meta.className='u-meta';
      const t = document.createElement('div'); t.className='u-title'; t.textContent = item.title;
      const s = document.createElement('div'); s.className='u-sub'; s.textContent = `Latest: Ch ${c.attributes.chapter || '?'}${grp?(' • '+grp):''}`;
      const btn = document.createElement('button'); btn.textContent = isNew ? 'Read new' : 'Open'; btn.addEventListener('click', ()=> openManga(item.id, item.title, item.coverUrl, c.id));
      meta.appendChild(t); meta.appendChild(s);
      if (isNew){ const badge=document.createElement('div'); badge.className='badge'; badge.textContent='NEW'; row.appendChild(badge); }
      row.appendChild(img); row.appendChild(meta); row.appendChild(btn);
      box.appendChild(row);
    }catch(e){}
  }
}

// Recommendations (proxied)
async function renderRecos(){
  const box = $.reco; box.innerHTML='';
  const tagCounts = new Map();
  for (const item of state.library){
    try{
      const m = await fetch(prox(`${ORIGIN}/manga/${item.id}?includes[]=tags`)).then(r=>r.json());
      const tags = m.data?.attributes?.tags || [];
      tags.forEach(t=>{ const id=t.id; tagCounts.set(id,(tagCounts.get(id)||0)+1); });
    }catch(e){}
  }
  let url = `${ORIGIN}/manga?limit=12&includes[]=cover_art&order[followedCount]=desc`;
  const ratings = state.adult ? ['safe','suggestive','erotica','pornographic'] : ['safe','suggestive'];
  ratings.forEach(r => url += `&contentRating[]=${encodeURIComponent(r)}`);
  const topTags = Array.from(tagCounts.entries()).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([id])=>id);
  topTags.forEach(id => url += `&includedTags[]=${id}`);
  try{
    const res = await fetch(prox(url));
    const json = await res.json();
    const items = (json.data || []).filter(m => !state.library.some(l => l.id === m.id));
    if (!items.length){ box.innerHTML = '<p class="muted">No recommendations yet.</p>'; return; }
    items.forEach(m=> box.appendChild(drawCard(m)));
  }catch(e){
    box.innerHTML = '<p class="muted">Recommendations unavailable.</p>';
  }
}

// Reader (proxied)
const reader = { mangaId:null, chapterList:[], current:null, pageUrls:[] };
let savePageDebounce=null;

async function openManga(mangaId, title, coverUrl, preferChapterId=null, preferPage=1){
  const url = `${ORIGIN}/manga/${mangaId}/feed?limit=500&translatedLanguage[]=${encodeURIComponent(state.lang)}&order[chapter]=asc&order[volume]=asc`;
  const json = await fetch(prox(url)).then(r=>r.json());
  reader.chapterList = (json.data||[]).filter(c=>c.attributes?.pages>0);
  if (reader.chapterList.length===0){ alert('No chapters for this language. Try another in Settings.'); return; }

  let chap = preferChapterId ? reader.chapterList.find(c=>c.id===preferChapterId) : reader.chapterList[0];
  reader.mangaId = mangaId;
  await openChapter(chap, title, preferPage);

  $.chapterSelect.innerHTML='';
  reader.chapterList.forEach((c,i)=>{
    const opt=document.createElement('option');
    const num = c.attributes.chapter || `#${i+1}`;
    opt.value=c.id; opt.textContent = `Ch ${num}`;
    if (c.id===chap.id) opt.selected=true;
    $.chapterSelect.appendChild(opt);
  });
  $.chapterSelect.onchange = async (e)=>{
    const next = reader.chapterList.find(c=>c.id===e.target.value);
    await openChapter(next, title, 1);
  };

  $.reader.classList.remove('hidden');
  $.readerTitle.textContent = title;
  applyReaderMode();
  setupTapZones();
}

async function openChapter(chapter, title, gotoPage=1){
  reader.current = chapter;
  const ah = await fetch(prox(`${ORIGIN}/at-home/server/${chapter.id}`)).then(r=>r.json());
  const base = ah.baseUrl;
  const hash = chapter.attributes.hash;
  const data = chapter.attributes.data;
  reader.pageUrls = data.map(file => `${base}/data/${hash}/${file}`);

  $.pages.innerHTML='';
  reader.pageUrls.forEach((src, idx)=>{
    const page = document.createElement('div'); page.className='page';
    const img = document.createElement('img'); img.loading='lazy'; img.decoding='async';
    img.src = src; img.alt = `${title} - p${idx+1}`;
    img.className='fade'; img.onload=()=>img.classList.add('loaded');
    page.appendChild(img); $.pages.appendChild(page);
  });

  const lib = state.library.find(x=>x.id===reader.mangaId);
  const saved = lib?.lastRead;
  let targetPage = gotoPage;
  if (saved && saved.chapterId === chapter.id && saved.page){ targetPage = saved.page; }
  queueMicrotask(()=> jumpToPage(targetPage));

  trackCurrentPageDebounced();
  if (lib){ lib.lastRead = lib.lastRead || {}; lib.lastRead.chapterId = chapter.id; lib.lastRead.chapter = chapter.attributes.chapter || ''; save(); }
}

function applyReaderMode(){
  $.pages.classList.remove('swipe','scroll','webtoon');
  if (state.mode === 'swipe'){ $.pages.classList.add('swipe'); $.pages.style.overflowY='hidden'; $.pages.style.overflowX='auto'; }
  else if (state.mode === 'webtoon'){ $.pages.classList.add('webtoon'); $.pages.style.overflowY='auto'; $.pages.style.overflowX='hidden'; }
  else { $.pages.classList.add('scroll'); $.pages.style.overflowY='auto'; $.pages.style.overflowX='hidden'; }
}

function setupTapZones(){
  $.tapLeft.onclick = ()=> pagePrev();
  $.tapRight.onclick = ()=> pageNext();
}
function pageIndex(){
  if (state.mode==='swipe'){
    const w = $.pages.clientWidth || 1;
    return Math.round($.pages.scrollLeft / w) + 1;
  } else {
    const topBarBottom = document.querySelector('.reader-topbar').getBoundingClientRect().bottom;
    let idx = 0, bestDist = 1e9;
    Array.from($.pages.children).forEach((p,i)=>{
      const d = Math.abs(p.getBoundingClientRect().top - topBarBottom);
      if (d < bestDist){ bestDist = d; idx = i; }
    });
    return idx+1;
  }
}
function pagesCount(){ return $.pages.children.length; }
function jumpToPage(n){
  n = Math.max(1, Math.min(n, pagesCount()));
  if (state.mode==='swipe'){
    $.pages.scrollTo({ left: (n-1) * $.pages.clientWidth, behavior:'smooth' });
  } else {
    const target = $.pages.children[n-1];
    if (target) target.scrollIntoView({behavior:'smooth', block:'start'});
  }
  saveCurrentPage(n);
  preloadAhead(n+1);
}
function pageNext(){ jumpToPage(pageIndex()+1); }
function pagePrev(){ jumpToPage(pageIndex()-1); }

function trackCurrentPageDebounced(){
  if (savePageDebounce) $.pages.removeEventListener('scroll', savePageDebounce);
  let raf=null;
  savePageDebounce = ()=>{
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(()=>{
      const n = pageIndex();
      saveCurrentPage(n);
      preloadAhead(n+1);
    });
  };
  $.pages.addEventListener('scroll', savePageDebounce, {passive:true});
  window.onresize = ()=>{ const n = pageIndex(); saveCurrentPage(n); };
}
function saveCurrentPage(n){
  const lib = state.library.find(x=>x.id===reader.mangaId);
  if (!lib) return;
  lib.lastRead = lib.lastRead || {};
  lib.lastRead.page = n;
  lib.lastRead.chapterId = reader.current?.id;
  lib.lastRead.chapter = reader.current?.attributes?.chapter || '';
  save();
}
function preloadAhead(startIndex){
  const end = Math.min(reader.pageUrls.length, startIndex + 10);
  for (let i=startIndex-1; i<end; i++){
    if (i<0) continue;
    const src = reader.pageUrls[i];
    const img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';
    img.src = src;
  }
}
function reopenCurrentChapter(){
  if (!reader.current || $.reader.classList.contains('hidden')) return;
  openChapter(reader.current, $.readerTitle.textContent, 1);
}

// Mark current chapter as read
$.markRead.addEventListener('click', ()=>{
  const lib = state.library.find(x=>x.id===reader.mangaId);
  if (!lib || !reader.current) return;
  lib.lastRead = lib.lastRead || {};
  lib.lastRead.chapterId = reader.current.id;
  lib.lastRead.chapter = reader.current.attributes.chapter || '';
  lib.lastRead.page = pagesCount();
  save();
  alert('Marked as read.');
});

// Mode cycle button
$.modeToggle.addEventListener('click', ()=>{
  const order = ['swipe','scroll','webtoon'];
  const idx = order.indexOf(state.mode);
  state.mode = order[(idx+1) % order.length];
  save(); applyReaderMode();
});
el('#reader-back').addEventListener('click', ()=>{
  $.reader.classList.add('hidden');
});

// First paints
renderLibrary();
renderUpdates();
renderRecos();
