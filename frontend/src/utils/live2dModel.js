import JSZip from 'jszip'

// 把 Live2D 模型 zip 解成"可加载的 model3.json blob URL"，返回 { url, dispose }
export async function modelZipToObjectUrl(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer)
  const files = Object.keys(zip.files).filter(p => !zip.files[p].dir)
  let modelPath = files.find(p => p.toLowerCase().endsWith('.model3.json'))
  if (!modelPath) throw new Error('zip 里没找到 .model3.json（需 Live2D Cubism4 模型）')
  const base = modelPath.slice(0, modelPath.lastIndexOf('/') + 1)

  const urlMap = new Map()
  for (const p of files) {
    const rel = (p.startsWith(base) ? p.slice(base.length) : p).toLowerCase()
    const blob = await zip.files[p].async('blob')
    urlMap.set(rel, URL.createObjectURL(blob))
  }
  const json = JSON.parse(await zip.files[modelPath].async('string'))
  const R = json.FileReferences || {}
  const map = v => v ? (urlMap.get(String(v).toLowerCase()) || v) : v
  if (R.Moc) R.Moc = map(R.Moc)
  if (R.Textures) R.Textures = R.Textures.map(map)
  if (R.Physics) R.Physics = map(R.Physics)
  if (R.Pose) R.Pose = map(R.Pose)
  if (R.DisplayInfo) R.DisplayInfo = map(R.DisplayInfo)
  if (R.Expressions) R.Expressions.forEach(e => { e.File = map(e.File) })
  if (R.Motions) for (const g in R.Motions) R.Motions[g].forEach(m => { m.File = map(m.File) })

  const jsonBlob = new Blob([JSON.stringify(json)], { type: 'application/json' })
  const url = URL.createObjectURL(jsonBlob)
  return { url, dispose: () => { urlMap.forEach(u => URL.revokeObjectURL(u)); URL.revokeObjectURL(url) } }
}

// ===== IndexedDB 存原始 zip（localStorage 放不下几 MB）=====
const DB = 'live2d-model', STORE = 'zip'
function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
}
export async function saveModelZip(buf) {
  const db = await openDb()
  return new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(buf, 'model'); t.oncomplete = res; t.onerror = () => rej(t.error) })
}
export async function loadModelZip() {
  const db = await openDb()
  return new Promise((res, rej) => { const t = db.transaction(STORE, 'readonly'); const rq = t.objectStore(STORE).get('model'); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => rej(rq.error) })
}
export async function clearModelZip() {
  const db = await openDb()
  return new Promise(res => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete('model'); t.oncomplete = res })
}
