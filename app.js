// Minimal app.js showing forced English language
// ... same as v2.4 but replace all state.lang with 'en'
// Example search:
async function searchManga(q){
  const path = `/manga?title=${encodeURIComponent(q)}&limit=20&includes[]=author&includes[]=cover_art&availableTranslatedLanguage[]=en`;
  const json = await apiFetch(path);
  // ...
}
// Example updates:
async function fetchUpdates(id){
  return await apiFetch(`/manga/${id}/feed?limit=1&translatedLanguage[]=en&order[readableAt]=desc&includes[]=scanlation_group`);
}
// Example chapters:
async function fetchChapters(id){
  return await apiFetch(`/manga/${id}/feed?limit=500&translatedLanguage[]=en&order[chapter]=asc&order[volume]=asc`);
}
