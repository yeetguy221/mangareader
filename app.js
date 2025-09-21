// Minimal MangaDex client + UI
const API = 'https://api.mangadex.org';

const el = s => document.querySelector(s);
const tpl = id => el(id).content.firstElementChild.cloneNode(true);
const state = {
  library: JSON.parse(localStorage.getItem('library') || '[]'), // [{id, title, coverUrl, lastRead: {chapterId, page}}]
  mode: localStorage.getItem('mode') || 'swipe' // 'swipe'|'scroll'
};

function save() {
  localStorage.setItem('library', JSON.stringify(state.library));
  localStorage.setItem('mode', state.mode);
}

// Tabs
['home','library','settings'].forEach(name=>{
  el(`#tab-${name}`).addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    el(`#tab-${name}`).classList.add('active');
    el(`#view-${name}`).classList.add('active');
    if (name==='library') renderLibrary();
  });
});

// Settings
el('#reading-mode').value = state.mode;
el('#reading-mode').addEventListener('change', (e)=>{
  state.mode = e.target.value;
  save();
  applyReaderMode();
});

// Search
el('#search-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const q = el('#search-input').value.trim();
  if (!q) return;
  const res = await fetch(`${API}/manga?title=${encodeURIComponent(q)}&limit=20&includes[]=author&includes[]=cover_art`);
  const json = await res.json();
  const items = json.data || [];
  const out = el('#results');
  out.innerHTML = '';
  items.forEach(m=>{
    const card = tpl('#card-tpl');
    const title = m.attributes.title.en || m.attributes.title[Object.keys(m.attributes.title)[0]] || 'Untitled';
    const authorRel = (m.relationships||[]).find(r=>r.type==='author');
    const coverRel = (m.relationships||[]).find(r=>r.type==='cover_art');
    const fileName = coverRel?.attributes?.fileName;
    const coverUrl = fileName ? `https://uploads.mangadex.org/covers/${m.id}/${fileName}.256.jpg` : '';
    card.querySelector('.title').textContent = title;
    card.querySelector('.author').textContent = authorRel?.attributes?.name || '—';
    const img = card.querySelector('.cover'); if (coverUrl) img.src = coverUrl; img.alt = title;

    card.querySelector('.open').addEventListener('click', ()=> openManga(m.id, title, coverUrl));
    card.querySelector('.follow').addEventListener('click', ()=>{
      if (!state.library.find(x=>x.id===m.id)) state.library.push({id:m.id, title, coverUrl, lastRead:null});
      save(); renderLibrary();
      card.querySelector('.follow').textContent = 'Saved ✓';
    });
    out.appendChild(card);
  });
});

// Library
function renderLibrary(){
  const box = el('#library'); box.innerHTML = '';
  if (state.library.length===0){ box.innerHTML='<p class="muted">No titles saved yet.</p>'; return; }
  state.library.forEach(item=>{
    const card = tpl('#card-tpl');
    card.querySelector('.title').textContent = item.title;
    card.querySelector('.author').textContent = item.lastRead ? `Last: ch ${item.lastRead.chapter}` : '';
    const img = card.querySelector('.cover'); if (item.coverUrl) img.src = item.coverUrl; img.alt = item.title;
    card.querySelector('.open').textContent = 'Resume';
    card.querySelector('.open').addEventListener('click', ()=> openManga(item.id, item.title, item.coverUrl, item.lastRead?.chapterId));
    card.querySelector('.follow').textContent = 'Remove';
    card.querySelector('.follow').addEventListener('click', ()=>{
      state.library = state.library.filter(x=>x.id!==item.id);
      save(); renderLibrary();
    });
    box.appendChild(card);
  });
}

// Reader
const reader = {
  visible:false, mangaId:null, chapterList:[], current:null, pages:[], baseUrl:null
};

async function openManga(mangaId, title, coverUrl, preferChapterId=null){
  // Fetch chapters (English by default; change "translatedLanguage" as you like)
  const res = await fetch(`${API}/manga/${mangaId}/feed?limit=500&translatedLanguage[]=en&order[chapter]=asc&order[volume]=asc`);
  const json = await res.json();
  reader.chapterList = (json.data||[]).filter(c=>c.attributes?.pages>0);
  if (reader.chapterList.length===0) { alert('No chapters. Try another language in app.js.'); return; }

  // Pick chapter
  let chap = preferChapterId ? reader.chapterList.find(c=>c.id===preferChapterId) : reader.chapterList[0];
  reader.mangaId = mangaId;
  await openChapter(chap, title);

  // Build chapter dropdown
  const sel = el('#chapter-select'); sel.innerHTML='';
  reader.chapterList.forEach((c,i)=>{
    const opt = document.createElement('option');
    const num = c.attributes.chapter || `#${i+1}`;
    opt.value = c.id; opt.textContent = `Ch ${num}`;
    if (c.id===chap.id) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.onchange = async (e)=> {
    const next = reader.chapterList.find(c=>c.id===e.target.value);
    await openChapter(next, title);
  };

  // Show reader
  document.querySelector('#reader').classList.remove('hidden');
  document.querySelector('#reader-title').textContent = title;
  applyReaderMode();
  reader.visible = true;
}

async function openChapter(chapter, title){
  reader.current = chapter;
  // Get at-home server (baseUrl) and construct image URLs
  const ah = await fetch(`${API}/at-home/server/${chapter.id}`).then(r=>r.json());
  const base = ah.baseUrl;
  const hash = chapter.attributes.hash || chapter.attributes?.hash;
  const data = chapter.attributes.data;
  const pages = data.map(file => `${base}/data/${hash}/${file}`);

  const box = document.querySelector('#reader-pages'); box.innerHTML='';
  pages.forEach((src, idx)=>{
    const page = document.createElement('div'); page.className='page';
    const img = document.createElement('img'); img.loading='eager'; img.src = src; img.alt = `${title} - p${idx+1}`;
    page.appendChild(img); box.appendChild(page);
  });

  // Save lastRead
  const lib = state.library.find(x=>x.id===reader.mangaId);
  if (lib) { lib.lastRead = { chapterId: chapter.id, chapter: chapter.attributes.chapter || '', page: 1 }; save(); }
}

function applyReaderMode(){
  const box = document.querySelector('#reader-pages');
  const swipe = state.mode === 'swipe';
  box.classList.toggle('swipe', swipe);
  box.style.overflowY = swipe ? 'hidden' : 'auto';
  box.style.overflowX = swipe ? 'auto' : 'hidden';
}

document.querySelector('#mode-toggle').addEventListener('click', ()=>{
  state.mode = (state.mode === 'swipe') ? 'scroll' : 'swipe';
  save(); applyReaderMode();
});

document.querySelector('#reader-back').addEventListener('click', ()=>{
  document.querySelector('#reader').classList.add('hidden');
  reader.visible=false;
});
