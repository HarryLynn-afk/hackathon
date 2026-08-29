const KEY = 'plant-doctor-plantings'
const SIM_KEY = 'plant-doctor-sim-today'

export function loadPlantings() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function savePlantings(list) {
  localStorage.setItem(KEY, JSON.stringify(list))
}

export function addPlanting(planting) {
  const list = [planting, ...loadPlantings()]
  savePlantings(list)
  return list
}

export function updatePlanting(id, patch) {
  const list = loadPlantings().map((item) => (item.id === id ? { ...item, ...patch } : item))
  savePlantings(list)
  return list
}

export function loadSimToday() {
  try {
    return localStorage.getItem(SIM_KEY) || null
  } catch {
    return null
  }
}

export function saveSimToday(iso) {
  if (!iso) localStorage.removeItem(SIM_KEY)
  else localStorage.setItem(SIM_KEY, iso)
}
