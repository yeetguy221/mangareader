const API = 'https://api.mangadex.org';

const el = s => document.querySelector(s);
const tpl = id => el(id).content.firstElementChild.cloneNode(true);
const $ = {
  results: el('#results'),
  updates: el('#updates'),
  library: el('#library'),
  pages: el('#reader-pages'),
  chapterSelect: el('#chapter-select'),
  reader: el('#reader'),
  readerTitle: el('#reader-title'),
  modeToggle: el('#mode-toggle'),
  modeSelect: el('#reading-mode'),
  langSelect: el('#language-select'),
  searchForm: el('#search-form'),
  searchInput: el('#search-input'),
  tapLeft: el('#tap-left'),
  tapRight: el('#tap-right'),
};

const state = {
  library: JSON.parse(localStorage.getItem('library') || '[]'),
  mode: localStorage.getItem('mode') || 'swipe',
  lang: localStorage.getItem('lang') || 'en'
};
function save(){ localStorage.setItem('library', JSON.stringify(state.library)); localStorage.setItem('mode', state.mode); localStorage.setItem('lang', state.lang); }

['home','library','settings'].forEach(name=>{
  el(`#tab-${name}`).addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    el(`#tab-${name}`).classList.add('active');
    el(`#view-${name}`).classList.add('active');
    if (name==='library') renderLibrary();
    if (name==='home') renderUpdates();
  });
});

$.modeSelect.value = state.mode;
$.langSelect.value = state.lang;
$.modeSelect.addEventListener('change',(e)=>{ state.mode = e.target.value; save(); applyReaderMode(); });
$.langSelect.addEventListener('change',(e)=>{ state.lang = e.target.value; save(); if(!$.reader.classList.contains('hidden')) reopenCurrentChapter(); });

$.searchForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const q = $.searchInput.value.trim();
  if (!q) return;
  const url = `${API}/manga?title=${encodeURIComponent(q)}&limit=20&includes[]=author&includes[]=cover_art`;
  const res = await fetch(url);
  const json = await res.json();
  const items = json.data || [];
  $.results.innerHTML = '';
  items.forEach(m=>{
    const card = tpl('#card-tpl');
    const title = m.attributes.title.en || m.attributes.title[Object.keys(m.attributes.title)[0]] || 'Untitled';
    const authorRel = (m.relationships||[]).find(r=>r.type==='author');
    const coverRel = (m.relationships||[]).find(r=>r.type==='cover_art');
    const fileName = coverRel?.attributes?.fileName;
    const coverUrl = fileName ? `https://uploads.mangadex.org/covers/${m.id}/${fileName}.256.jpg` : '';
    card.querySelector('.title').textContent = title;
    card.querySelector('.author').textContent = authorRel?.attributes?.name || '—';
    const img = card.querySelector('.cover'); if (coverUrl){ img.src = coverUrl; img.alt = title; img.onload=()=>img.classList.add('loaded'); }
    card.querySelector('.open').addEventListener('click', ()=> openManga(m.id, title, coverUrl));
    card.querySelector('.follow').addEventListener('click', ()=>{
      if (!state.library.find(x=>x.id===m.id)) state.library.push({id:m.id, title, coverUrl, lastRead:null});
      save(); renderLibrary(); renderUpdates();
      card.querySelector('.follow').textContent = 'Saved ✓';
    });
    $.results.appendChild(card);
  });
});

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
      save(); renderLibrary(); renderUpdates();
    });
    $.library.appendChild(card);
  });
}

async function renderUpdates(){
  const box = $.updates; box.innerHTML='';
  if (state.library.length===0){ box.innerHTML='<p class="muted">Follow titles to see updates here.</p>'; return; }
  for (const item of state.library){
    try{
      const feed = await fetch(`${API}/manga/${item.id}/feed?limit=1&translatedLanguage[]=${encodeURIComponent(state.lang)}&order[readableAt]=desc&includes[]=scanlation_group`).then(r=>r.json());
      const c = feed.data?.[0];
      if (!c) continue;
      const num = c.attributes.chapter || '?';
      const grp = (c.relationships||[]).find(r=>r.type==='scanlation_group')?.attributes?.name || '';
      const row = document.createElement('div'); row.className='update-item';
      const img = document.createElement('img'); if (item.coverUrl){ img.src = item.coverUrl; img.className='fade'; img.onload=()=>img.classList.add('loaded'); }
      const meta = document.createElement('div'); meta.className='u-meta';
      const t = document.createElement('div'); t.className='u-title'; t.textContent = item.title;
      const s = document.createElement('div'); s.className='u-sub'; s.textContent = `Latest: Ch ${num}${grp?(' • '+grp):''}`;
      const btn = document.createElement('button'); btn.textContent='Open'; btn.addEventListener('click', ()=> openManga(item.id, item.title, item.coverUrl, c.id));
      meta.appendChild(t); meta.appendChild(s);
      row.appendChild(img); row.appendChild(meta); row.appendChild(btn);
      box.appendChild(row);
    }catch(e){}
  }
}

const reader = { mangaId:null, chapterList:[], current:null };
let savePageDebounce=null;

async function openManga(mangaId, title, coverUrl, preferChapterId=null, preferPage=1){
  const res = await fetch(`${API}/manga/${mangaId}/feed?limit=500&translatedLanguage[]=${encodeURIComponent(state.lang)}&order[chapter]=asc&order[volume]=asc`);
  const json = await res.json();
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
  const ah = await fetch(`${API}/at-home/server/${chapter.id}`).then(r=>r.json());
  const base = ah.baseUrl;
  const hash = chapter.attributes.hash;
  const data = chapter.attributes.data;

  $.pages.innerHTML='';
  data.forEach((file, idx)=>{
    const page = document.createElement('div'); page.className='page';
    const img = document.createElement('img'); img.loading='eager'; img.decoding='async';
    img.src = `${base}/data/${hash}/${file}`; img.alt = `${title} - p${idx+1}`;
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
  const swipe = state.mode === 'swipe';
  $.pages.classList.toggle('swipe', swipe);
  $.pages.style.overflowY = swipe ? 'hidden' : 'auto';
  $.pages.style.overflowX = swipe ? 'auto' : 'hidden';
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
    // Approx: find the page whose top is closest to the viewport top (below reader-topbar)
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
function reopenCurrentChapter(){
  if (!reader.current || $.reader.classList.contains('hidden')) return;
  openChapter(reader.current, $.readerTitle.textContent, 1);
}

$.modeToggle.addEventListener('click', ()=>{
  state.mode = (state.mode==='swipe') ? 'scroll' : 'swipe';
  save(); applyReaderMode();
});
el('#reader-back').addEventListener('click', ()=>{
  $.reader.classList.add('hidden');
});

renderLibrary();
renderUpdates();
