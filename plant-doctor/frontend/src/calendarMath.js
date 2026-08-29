const MM_MONTHS = [
  'ဇန်နဝါရီ',
  'ဖေဖော်ဝါရီ',
  'မတ်',
  'ဧပြီ',
  'မေ',
  'ဇွန်',
  'ဇူလိုင်',
  'ဩဂုတ်',
  'စက်တင်ဘာ',
  'အောက်တိုဘာ',
  'နိုဝင်ဘာ',
  'ဒီဇင်ဘာ',
]

export function todayISO() {
  return toISO(new Date())
}

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISO(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(iso, days) {
  const date = parseISO(iso)
  date.setDate(date.getDate() + days)
  return toISO(date)
}

export function daysBetween(fromIso, toIso) {
  const ms = parseISO(toIso) - parseISO(fromIso)
  return Math.max(0, Math.round(ms / 86400000))
}

export function typicalDays(crop) {
  return Math.floor((Number(crop.min_days) + Number(crop.max_days)) / 2)
}

export function formatDate(iso, lang) {
  if (!iso) return '—'
  const date = parseISO(iso)
  if (lang === 'mm') {
    return `${date.getDate()} ${MM_MONTHS[date.getMonth()]} ${date.getFullYear()}`
  }
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function previewFromCrop(crop, plantedOn, today = todayISO()) {
  const typical = typicalDays(crop)
  const grown = daysBetween(plantedOn, today)
  const ratio = typical > 0 ? Math.max(0, Math.min(1, grown / typical)) : 0
  const stage = currentStage(crop.stages, ratio)
  return {
    crop: crop.id,
    planted_on: plantedOn,
    season_year: parseISO(plantedOn).getFullYear(),
    expected_harvest_start: addDays(plantedOn, crop.min_days),
    expected_harvest_end: addDays(plantedOn, crop.max_days),
    typical_days: typical,
    days_grown: grown,
    progress: Math.round(ratio * 1000) / 1000,
    stage: { id: stage.id, en: stage.en, mm: stage.mm },
    stages: crop.stages || [],
    reminders: buildReminders(crop, plantedOn, today, false),
    min_days: crop.min_days,
    max_days: crop.max_days,
  }
}

export function currentStage(stages, ratio) {
  const list = stages || []
  if (!list.length) {
    return { id: 'unknown', en: 'Growing', mm: 'ကြီးထွားနေသည်', start: 0, end: 1 }
  }
  for (const stage of list) {
    if (stage.start <= ratio && ratio < stage.end) return stage
    if (stage.end === 1 && ratio >= stage.start) return stage
  }
  return list[list.length - 1]
}

export function buildReminders(crop, plantedOn, today, harvested) {
  if (harvested) return []
  const items = []
  const harvestStart = addDays(plantedOn, crop.min_days)
  const harvestEnd = addDays(plantedOn, crop.max_days)
  const remindFrom = addDays(harvestStart, -14)

  if (daysBetween(harvestEnd, today) > 0 && today !== harvestEnd) {
    items.push({
      id: 'harvest_overdue',
      kind: 'harvest',
      date: harvestEnd,
      en: 'Harvest window has passed. Mark harvested when you finish.',
      mm: 'ရိတ်သိမ်းချိန် ကျော်လွန်ပါပြီ။ ရိတ်ပြီးလျှင် ရိတ်သိမ်းပြီးဟု မှတ်ပါ။',
    })
  } else if (today >= remindFrom) {
    items.push({
      id: 'harvest_soon',
      kind: 'harvest',
      date: harvestStart,
      en: 'Harvest window is near. Prepare to harvest.',
      mm: 'ရိတ်သိမ်းချိန် နီးလာပါပြီ။ ရိတ်သိမ်းရန် ပြင်ဆင်ပါ။',
    })
  }

  for (const task of crop.care || []) {
    const due = addDays(plantedOn, task.day)
    const early = addDays(due, -7)
    const late = addDays(due, 7)
    if (today < early || today > late) continue
    items.push({
      id: task.id,
      kind: 'care',
      date: due,
      en: task.en,
      mm: task.mm,
    })
  }
  return items
}

export function enrichPlanting(planting, crop, today = todayISO()) {
  if (!crop) {
    return {
      ...planting,
      progress: 0,
      daysGrown: 0,
      stage: { en: '', mm: '' },
      reminders: [],
    }
  }
  const harvested = Boolean(planting.actualHarvestOn)
  const preview = previewFromCrop(crop, planting.plantedOn, today)
  return {
    ...planting,
    progress: harvested ? 1 : preview.progress,
    daysGrown: preview.days_grown,
    stage: preview.stage,
    stages: crop.stages || [],
    reminders: buildReminders(crop, planting.plantedOn, today, harvested),
    cropMeta: crop,
  }
}
