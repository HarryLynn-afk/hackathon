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

export const LOOK_AHEAD_CHOICES = [15, 30, 60]
export const LOOK_AHEAD_DEFAULT = 30

export function todayISO() {
  return toISO(new Date())
}

const GROWTH_DAYS = {
  rice: [120, 140],
  groundnut: [100, 120],
  black_gram: [70, 90],
  green_gram: [60, 75],
  pigeon_pea: [150, 180],
  sesame: [80, 100],
  chili: [90, 110],
  maize: [90, 120],
}

function isISODate(iso) {
  return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso)
}

export function parseISO(iso) {
  if (!isISODate(iso)) return new Date(NaN)
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISO(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(iso, days) {
  const n = Number(days)
  const date = parseISO(iso)
  if (Number.isNaN(date.getTime()) || !Number.isFinite(n)) return ''
  date.setDate(date.getDate() + n)
  return toISO(date)
}

export function daysBetween(fromIso, toIso) {
  const from = parseISO(fromIso)
  const to = parseISO(toIso)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0
  const ms = to - from
  return Math.max(0, Math.round(ms / 86400000))
}

export function growthRange(crop) {
  const min = Number(crop?.min_days)
  const max = Number(crop?.max_days)
  if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min) {
    return [min, max]
  }
  return GROWTH_DAYS[crop?.id] || [90, 120]
}

export function typicalDays(crop) {
  const [min, max] = growthRange(crop)
  return Math.floor((min + max) / 2)
}

export function formatDate(iso, lang) {
  const day = datePart(iso)
  if (!day) return '—'
  const date = parseISO(day)
  if (Number.isNaN(date.getTime())) return '—'
  if (lang === 'mm') {
    const month = MM_MONTHS[date.getMonth()]
    if (!month) return '—'
    return `${date.getDate()} ${month} ${date.getFullYear()}`
  }
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function datePart(value) {
  if (value instanceof Date) return toISO(value)
  if (typeof value !== 'string') return ''
  const day = value.slice(0, 10)
  return isISODate(day) ? day : ''
}

export function withGrowthDays(crop) {
  if (!crop) return crop
  const [minDays, maxDays] = growthRange(crop)
  return { ...crop, min_days: minDays, max_days: maxDays }
}

export function previewFromCrop(crop, plantedOn, today = todayISO()) {
  const [minDays, maxDays] = growthRange(crop)
  const typical = typicalDays(crop)
  const grown = daysBetween(plantedOn, today)
  const ratio = typical > 0 ? Math.max(0, Math.min(1, grown / typical)) : 0
  const stage = currentStage(crop.stages, ratio)
  return {
    crop: crop.id,
    planted_on: plantedOn,
    season_year: parseISO(plantedOn).getFullYear(),
    expected_harvest_start: addDays(plantedOn, minDays),
    expected_harvest_end: addDays(plantedOn, maxDays),
    typical_days: typical,
    days_grown: grown,
    progress: Math.round(ratio * 1000) / 1000,
    stage: { id: stage.id, en: stage.en, mm: stage.mm },
    stages: crop.stages || [],
    reminders: buildReminders(crop, plantedOn, today, false),
    min_days: minDays,
    max_days: maxDays,
  }
}

export function lookAhead(crop, plantedOn, today, aheadDays = LOOK_AHEAD_DEFAULT) {
  const ahead = Math.max(1, Number(aheadDays) || LOOK_AHEAD_DEFAULT)
  const targetDate = addDays(today, ahead)
  const [minDays, maxDays] = growthRange(crop)
  const typical = typicalDays(crop)
  const harvestStart = addDays(plantedOn, minDays)
  const harvestEnd = addDays(plantedOn, maxDays)

  const grown = daysBetween(plantedOn, targetDate)
  const ratio = typical > 0 ? Math.max(0, Math.min(1, grown / typical)) : 0
  const thenStage = currentStage(crop.stages, ratio)
  const nowRatio = typical > 0 ? Math.min(1, daysBetween(plantedOn, today) / typical) : 0
  const nowStage = currentStage(crop.stages, nowRatio)

  let harvestStatus = 'growing'
  if (targetDate > harvestEnd) harvestStatus = 'overdue'
  else if (targetDate >= harvestStart) harvestStatus = 'ready'

  // The work that lands between now and then — the reason to look ahead.
  const tasks = (crop.care || [])
    .map((task) => ({ ...task, date: addDays(plantedOn, task.day) }))
    .filter((task) => task.date > today && task.date <= targetDate)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((task) => ({ ...task, inDays: daysBetween(today, task.date) }))

  return {
    aheadDays: ahead,
    date: targetDate,
    daysGrown: grown,
    progress: Math.round(ratio * 1000) / 1000,
    stage: thenStage,
    stageChanged: thenStage.id !== nowStage.id,
    harvestStatus,
    daysToHarvest: daysBetween(targetDate, harvestStart),
    harvestStart,
    harvestEnd,
    tasks,
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
  const [minDays, maxDays] = growthRange(crop)
  const harvestStart = addDays(plantedOn, minDays)
  const harvestEnd = addDays(plantedOn, maxDays)
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
    expectedHarvestStart: preview.expected_harvest_start,
    expectedHarvestEnd: preview.expected_harvest_end,
    progress: harvested ? 1 : preview.progress,
    daysGrown: preview.days_grown,
    stage: preview.stage,
    stages: crop.stages || [],
    reminders: buildReminders(crop, planting.plantedOn, today, harvested),
    cropMeta: crop,
  }
}
