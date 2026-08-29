import { useMemo, useState } from 'react'
import CropPicker from './CropPicker'
import { addPlanting, loadPlantings, loadSimToday, saveSimToday, updatePlanting } from './plantingsStore'
import {
  LOOK_AHEAD_CHOICES,
  LOOK_AHEAD_DEFAULT,
  addDays,
  enrichPlanting,
  formatDate,
  lookAhead,
  previewFromCrop,
  todayISO,
  withGrowthDays,
} from './calendarMath'

export default function Calendar({ crops, lang, t }) {
  const realToday = todayISO()
  const [simToday, setSimTodayState] = useState(() => loadSimToday() || realToday)
  const [plantings, setPlantings] = useState(loadPlantings)
  const [view, setView] = useState('list') // list | crop | form | detail | harvest
  const [crop, setCrop] = useState(null)
  const [plantedOn, setPlantedOn] = useState(realToday)
  const [variety, setVariety] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [harvestOn, setHarvestOn] = useState(realToday)
  const [yieldAmount, setYieldAmount] = useState('')

  const today = simToday
  const simulated = today !== realToday

  function setToday(iso) {
    setSimTodayState(iso)
    saveSimToday(iso === realToday ? null : iso)
  }

  const cropsReady = useMemo(() => crops.map(withGrowthDays), [crops])
  const cropMap = useMemo(() => Object.fromEntries(cropsReady.map((c) => [c.id, c])), [cropsReady])
  const enriched = plantings.map((p) => enrichPlanting(p, cropMap[p.cropId], today))
  const growing = enriched.filter((p) => !p.actualHarvestOn)
  const harvested = enriched.filter((p) => p.actualHarvestOn)
  const selected = enriched.find((p) => p.id === selectedId)
  const reminderBanner = growing.flatMap((p) =>
    p.reminders.map((r) => ({ ...r, planting: p })),
  )

  function openDetail(id) {
    setSelectedId(id)
    setView('detail')
  }

  async function saveNew() {
    if (!crop || !plantedOn) return
    const local = previewFromCrop(withGrowthDays(crop), plantedOn, today)
    let preview = local
    try {
      const resp = await fetch('/api/calendar/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crop: crop.id, planted_on: plantedOn, today }),
      })
      if (resp.ok) {
        const remote = await resp.json()
        const start = remote.expected_harvest_start
        const end = remote.expected_harvest_end
        preview = {
          ...local,
          ...remote,
          expected_harvest_start:
            typeof start === 'string' && /^\d{4}-\d{2}-\d{2}/.test(start)
              ? start.slice(0, 10)
              : local.expected_harvest_start,
          expected_harvest_end:
            typeof end === 'string' && /^\d{4}-\d{2}-\d{2}/.test(end)
              ? end.slice(0, 10)
              : local.expected_harvest_end,
        }
      }
    } catch {
      preview = local
    }
    const planting = {
      id: crypto.randomUUID(),
      cropId: crop.id,
      variety: variety.trim(),
      plantedOn,
      expectedHarvestStart: preview.expected_harvest_start,
      expectedHarvestEnd: preview.expected_harvest_end,
      actualHarvestOn: null,
      yieldAmount: '',
      seasonYear: preview.season_year,
    }
    setPlantings(addPlanting(planting))
    setCrop(null)
    setVariety('')
    setPlantedOn(today)
    setSelectedId(planting.id)
    setView('detail')
  }

  function saveHarvest() {
    if (!selectedId || !harvestOn) return
    setPlantings(
      updatePlanting(selectedId, {
        actualHarvestOn: harvestOn,
        yieldAmount: yieldAmount.trim(),
      }),
    )
    setYieldAmount('')
    setView('detail')
  }

  const clock = (
    <DemoClock
      today={today}
      realToday={realToday}
      simulated={simulated}
      lang={lang}
      t={t}
      onChange={setToday}
    />
  )

  if (view === 'crop') {
    return (
      <>
        {clock}
        <CropPicker
          crops={cropsReady}
          lang={lang}
          t={{ ...t, chooseCrop: t.calendarChooseCrop, chooseCropHint: t.calendarChooseHint }}
          onPick={(c) => {
            setCrop(c)
            setView('form')
          }}
          onBack={() => setView('list')}
        />
      </>
    )
  }

  if (view === 'form' && crop) {
    const live = previewFromCrop(crop, plantedOn, today)
    return (
      <>
        {clock}
        <div className="px-4 pb-8">
        <div className="mt-6 flex items-center justify-center gap-3">
          <span className="text-4xl" aria-hidden="true">{crop.icon}</span>
          <span className="mm-text text-2xl font-bold text-green-900">{crop.name[lang]}</span>
        </div>
        <label className="mm-text mt-8 block text-lg font-bold text-green-900">{t.plantedOn}</label>
        <input
          type="date"
          value={plantedOn}
          max={today}
          onChange={(e) => setPlantedOn(e.target.value)}
          className="mt-2 min-h-14 w-full rounded-2xl border-2 border-green-300 bg-white px-4 text-lg text-green-950 outline-none focus:border-green-700"
        />
        <label className="mm-text mt-6 block text-lg font-bold text-green-900">{t.variety}</label>
        <input
          value={variety}
          onChange={(e) => setVariety(e.target.value)}
          placeholder={t.varietyHint}
          className="mm-text mt-2 min-h-14 w-full rounded-2xl border-2 border-green-300 bg-white px-4 text-lg outline-none focus:border-green-700"
        />
        <p className="mm-text mt-4 text-green-800/70">
          {t.harvestWindow}: {formatDate(live.expected_harvest_start, lang)}
          {' – '}
          {formatDate(live.expected_harvest_end, lang)}
        </p>
        <button
          onClick={saveNew}
          className="mm-text mt-8 flex min-h-20 w-full items-center justify-center rounded-2xl bg-green-700 text-2xl font-bold text-white shadow-md transition active:scale-95"
        >
          {t.savePlanting}
        </button>
        <button onClick={() => setView('crop')} className="mm-text mt-6 w-full text-lg font-semibold text-green-800/70 underline">
          ← {t.back}
        </button>
        </div>
      </>
    )
  }

  if ((view === 'detail' || view === 'harvest') && selected) {
    return (
      <>
        {clock}
        <PlantingDetail
        planting={selected}
        lang={lang}
        t={t}
        today={today}
        harvestMode={view === 'harvest'}
        harvestOn={harvestOn}
        yieldAmount={yieldAmount}
        onHarvestOn={setHarvestOn}
        onYieldAmount={setYieldAmount}
        onBack={() => setView('list')}
        onCancelHarvest={() => setView('detail')}
        onMarkHarvest={() => {
          setHarvestOn(today)
          setYieldAmount(selected.yieldAmount || '')
          setView('harvest')
        }}
        onSaveHarvest={saveHarvest}
      />
      </>
    )
  }

  return (
    <>
      {clock}
      <div className="px-4 pb-8">
      <h2 className="mm-text mt-6 text-center text-2xl font-bold text-green-900">{t.calendarTitle}</h2>
      <p className="mm-text mt-1 mb-4 text-center text-green-800/70">{t.calendarHint}</p>

      {reminderBanner.length > 0 && (
        <div className="mb-4 space-y-3">
          {reminderBanner.map((r) => (
            <button
              key={`${r.planting.id}-${r.id}`}
              onClick={() => openDetail(r.planting.id)}
              className="w-full rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-left"
            >
              <p className="mm-text text-lg font-bold text-amber-950">
                {r.planting.cropMeta?.icon} {r.planting.cropMeta?.name[lang]}
              </p>
              <p className="mm-text mt-1 text-lg leading-relaxed text-amber-900">{r[lang]}</p>
            </button>
          ))}
        </div>
      )}

      {growing.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-green-300 bg-white px-4 py-10 text-center">
          <p className="text-5xl" aria-hidden="true">📅</p>
          <p className="mm-text mt-4 text-xl font-bold text-green-900">{t.calendarEmpty}</p>
          <p className="mm-text mt-2 text-green-800/70">{t.calendarEmptyHint}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {growing.map((p) => (
            <PlantingCard key={p.id} planting={p} lang={lang} t={t} onOpen={() => openDetail(p.id)} />
          ))}
        </div>
      )}

      <button
        onClick={() => setView('crop')}
        className="mm-text mt-6 flex min-h-20 w-full items-center justify-center rounded-2xl bg-green-700 text-2xl font-bold text-white shadow-md transition active:scale-95"
      >
        {t.newPlanting}
      </button>

      <HistorySection plantings={harvested} lang={lang} t={t} onOpen={openDetail} />
    </div>
    </>
  )
}

function DemoClock({ today, realToday, simulated, lang, t, onChange }) {
  return (
    <div className={`mx-4 mt-4 rounded-2xl border-2 p-4 ${simulated ? 'border-sky-500 bg-sky-50' : 'border-green-200 bg-white'}`}>
      <p className="mm-text text-lg font-bold text-green-900">{t.simClock}</p>
      <p className="mm-text mt-1 text-green-800/70">{t.simHint}</p>
      <input
        type="date"
        value={today}
        onChange={(e) => onChange(e.target.value || realToday)}
        className="mt-3 min-h-14 w-full rounded-2xl border-2 border-green-300 bg-white px-4 text-lg outline-none focus:border-green-700"
      />
      <p className="mm-text mt-2 text-lg font-semibold text-green-900">{formatDate(today, lang)}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onChange(addDays(today, -7))}
          className="mm-text min-h-12 rounded-xl border-2 border-green-700 bg-white text-lg font-bold text-green-800 transition active:scale-95"
        >
          {t.simBack7}
        </button>
        <button
          type="button"
          onClick={() => onChange(addDays(today, 7))}
          className="mm-text min-h-12 rounded-xl border-2 border-green-700 bg-white text-lg font-bold text-green-800 transition active:scale-95"
        >
          {t.simSkip7}
        </button>
        <button
          type="button"
          onClick={() => onChange(addDays(today, 30))}
          className="mm-text min-h-12 rounded-xl border-2 border-green-700 bg-white text-lg font-bold text-green-800 transition active:scale-95"
        >
          {t.simSkip30}
        </button>
      </div>
      {simulated && (
        <button
          type="button"
          onClick={() => onChange(realToday)}
          className="mm-text mt-3 w-full min-h-12 rounded-xl bg-sky-700 text-lg font-bold text-white transition active:scale-95"
        >
          {t.simReset}
        </button>
      )}
    </div>
  )
}

function PlantingCard({ planting, lang, t, onOpen }) {
  const pct = Math.round((planting.progress || 0) * 100)
  return (
    <button
      onClick={onOpen}
      className="w-full rounded-2xl border-2 border-green-200 bg-white p-5 text-left shadow-sm transition active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-3xl" aria-hidden="true">{planting.cropMeta?.icon}</p>
          <h3 className="mm-text mt-1 text-xl font-bold text-green-900">
            {planting.cropMeta?.name[lang]}
            {planting.variety ? ` · ${planting.variety}` : ''}
          </h3>
        </div>
        <span className="mm-text rounded-full border-2 border-green-600 px-3 py-1 text-sm font-semibold text-green-800">
          {planting.stage?.[lang]}
        </span>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-green-100">
        <div className="h-full rounded-full bg-green-700" style={{ width: `${pct}%` }} />
      </div>
      <p className="mm-text mt-3 text-lg text-green-800">
        {t.growingDay.replace('{n}', planting.daysGrown)} · {pct}%
      </p>
      <p className="mm-text mt-1 text-green-800/70">
        {t.harvestWindow}: {formatDate(planting.expectedHarvestStart, lang)} – {formatDate(planting.expectedHarvestEnd, lang)}
      </p>
    </button>
  )
}

function PlantingDetail({
  planting,
  lang,
  t,
  today,
  harvestMode,
  harvestOn,
  yieldAmount,
  onHarvestOn,
  onYieldAmount,
  onBack,
  onCancelHarvest,
  onMarkHarvest,
  onSaveHarvest,
}) {
  const pct = Math.round((planting.progress || 0) * 100)
  const harvested = Boolean(planting.actualHarvestOn)

  if (harvestMode) {
    return (
      <div className="px-4 pb-8">
        <h2 className="mm-text mt-6 text-center text-2xl font-bold text-green-900">{t.markHarvested}</h2>
        <label className="mm-text mt-8 block text-lg font-bold text-green-900">{t.harvestDate}</label>
        <input
          type="date"
          value={harvestOn}
          min={planting.plantedOn}
          max={today}
          onChange={(e) => onHarvestOn(e.target.value)}
          className="mt-2 min-h-14 w-full rounded-2xl border-2 border-green-300 bg-white px-4 text-lg outline-none focus:border-green-700"
        />
        <label className="mm-text mt-6 block text-lg font-bold text-green-900">{t.yieldAmount}</label>
        <input
          value={yieldAmount}
          onChange={(e) => onYieldAmount(e.target.value)}
          placeholder={t.yieldHint}
          className="mm-text mt-2 min-h-14 w-full rounded-2xl border-2 border-green-300 bg-white px-4 text-lg outline-none focus:border-green-700"
        />
        <button
          onClick={onSaveHarvest}
          className="mm-text mt-8 flex min-h-20 w-full items-center justify-center rounded-2xl bg-green-700 text-2xl font-bold text-white shadow-md transition active:scale-95"
        >
          {t.saveHarvest}
        </button>
        <button onClick={onCancelHarvest} className="mm-text mt-6 w-full text-lg font-semibold text-green-800/70 underline">
          ← {t.back}
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 pb-8">
      <div className="mt-6 flex items-center justify-center gap-3">
        <span className="text-4xl" aria-hidden="true">{planting.cropMeta?.icon}</span>
        <h2 className="mm-text text-2xl font-bold text-green-900">
          {planting.cropMeta?.name[lang]}
          {planting.variety ? ` · ${planting.variety}` : ''}
        </h2>
      </div>

      {planting.reminders.map((r) => (
        <div key={r.id} className="mt-4 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4">
          <p className="mm-text text-lg leading-relaxed text-amber-950">{r[lang]}</p>
        </div>
      ))}

      <div className="mt-4 rounded-2xl border-2 border-green-200 bg-white p-5">
        <p className="mm-text text-lg font-bold text-green-900">{t.growingStage}</p>
        <p className="mm-text mt-1 text-2xl font-bold text-green-800">{planting.stage?.[lang]}</p>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-green-100">
          <div className="h-full rounded-full bg-green-700" style={{ width: `${harvested ? 100 : pct}%` }} />
        </div>
        <p className="mm-text mt-3 text-lg text-green-800">
          {harvested ? t.harvested : t.growingDay.replace('{n}', planting.daysGrown)}
        </p>
      </div>

      <ol className="mt-4 space-y-2 rounded-2xl border-2 border-green-200 bg-white p-5">
        {(planting.stages || []).map((stage) => {
          const current = stage.id === planting.stage?.id && !harvested
          return (
            <li
              key={stage.id}
              className={`mm-text rounded-xl px-3 py-2 text-lg ${current ? 'bg-green-700 font-bold text-white' : 'text-green-900'}`}
            >
              {stage[lang]}
            </li>
          )
        })}
      </ol>

      {!harvested && <LookAheadCard planting={planting} lang={lang} t={t} today={today} />}

      <dl className="mt-4 space-y-3 rounded-2xl border-2 border-green-200 bg-white p-5 text-lg">
        <Row label={t.plantedOn} value={formatDate(planting.plantedOn, lang)} />
        <Row
          label={t.harvestWindow}
          value={`${formatDate(planting.expectedHarvestStart, lang)} – ${formatDate(planting.expectedHarvestEnd, lang)}`}
        />
        <Row
          label={t.actualHarvest}
          value={planting.actualHarvestOn ? formatDate(planting.actualHarvestOn, lang) : t.stillGrowing}
        />
        {planting.yieldAmount ? <Row label={t.yieldAmount} value={planting.yieldAmount} /> : null}
      </dl>

      {!harvested && (
        <button
          onClick={onMarkHarvest}
          className="mm-text mt-6 flex min-h-20 w-full items-center justify-center rounded-2xl bg-green-700 text-2xl font-bold text-white shadow-md transition active:scale-95"
        >
          {t.markHarvested}
        </button>
      )}
      <button onClick={onBack} className="mm-text mt-6 w-full text-lg font-semibold text-green-800/70 underline">
        ← {t.back}
      </button>
    </div>
  )
}

function LookAheadCard({ planting, lang, t, today }) {
  const [ahead, setAhead] = useState(LOOK_AHEAD_DEFAULT)
  const crop = planting.cropMeta
  if (!crop) return null

  const view = lookAhead(crop, planting.plantedOn, today, ahead)
  const pct = Math.round(view.progress * 100)
  const overdue = view.harvestStatus === 'overdue'
  const ready = view.harvestStatus === 'ready'
  const status = overdue
    ? t.lookAheadOverdue
    : ready
      ? t.lookAheadReady
      : t.lookAheadToHarvest.replace('{n}', view.daysToHarvest)

  const tone = overdue
    ? 'border-amber-400 bg-amber-50'
    : ready
      ? 'border-green-500 bg-green-50'
      : 'border-indigo-300 bg-indigo-50'

  return (
    <section className={`mt-4 rounded-2xl border-2 p-5 ${tone}`}>
      <p className="mm-text text-lg font-bold text-green-900">🔮 {t.lookAheadTitle}</p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {LOOK_AHEAD_CHOICES.map((days) => (
          <button
            key={days}
            type="button"
            onClick={() => setAhead(days)}
            aria-pressed={days === ahead}
            className={`mm-text min-h-12 rounded-xl border-2 text-lg font-bold transition active:scale-95 ${
              days === ahead
                ? 'border-green-700 bg-green-700 text-white'
                : 'border-green-700 bg-white text-green-800'
            }`}
          >
            {t.lookAheadDays.replace('{n}', days)}
          </button>
        ))}
      </div>

      <p className="mm-text mt-4 text-lg font-semibold text-green-900">{formatDate(view.date, lang)}</p>

      <p className="mm-text mt-3 text-green-800/70">{t.lookAheadStageThen}</p>
      <p className="mm-text text-2xl font-bold text-green-800">{view.stage?.[lang]}</p>
      <p className="mm-text mt-1 text-green-800/70">
        {view.stageChanged ? t.lookAheadNewStage : t.lookAheadSameStage}
      </p>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-green-700" style={{ width: `${pct}%` }} />
      </div>
      <p className="mm-text mt-3 text-lg font-semibold text-green-900">
        {t.growingDay.replace('{n}', view.daysGrown)} · {pct}%
      </p>
      <p className="mm-text mt-1 text-lg text-green-800">{status}</p>

      <p className="mm-text mt-5 text-lg font-bold text-green-900">{t.lookAheadTasks}</p>
      {view.tasks.length === 0 ? (
        <p className="mm-text mt-1 text-green-800/70">{t.lookAheadNoTasks}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {view.tasks.map((task) => (
            <li key={task.id} className="rounded-xl bg-white px-4 py-3">
              <p className="mm-text text-lg leading-relaxed text-green-900">{task[lang]}</p>
              <p className="mm-text mt-1 text-green-800/70">
                {formatDate(task.date, lang)} · {t.lookAheadTaskIn.replace('{n}', task.inDays)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}


function Row({ label, value }) {
  return (
    <div>
      <dt className="mm-text font-bold text-green-900">{label}</dt>
      <dd className="mm-text text-green-800">{value}</dd>
    </div>
  )
}

function HistorySection({ plantings, lang, t, onOpen }) {
  if (plantings.length === 0) return null
  const years = [...new Set(plantings.map((p) => p.seasonYear))].sort((a, b) => b - a)
  return (
    <div className="mt-10">
      <h3 className="mm-text text-xl font-bold text-green-900">{t.historyTitle}</h3>
      {years.map((year) => (
        <div key={year} className="mt-4">
          <p className="mm-text mb-2 text-lg font-semibold text-green-800">{year}</p>
          <div className="space-y-3">
            {plantings
              .filter((p) => p.seasonYear === year)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => onOpen(p.id)}
                  className="flex w-full items-center gap-3 rounded-2xl border-2 border-green-200 bg-white p-4 text-left"
                >
                  <span className="text-3xl" aria-hidden="true">{p.cropMeta?.icon}</span>
                  <span className="min-w-0">
                    <span className="mm-text block text-lg font-bold text-green-900">
                      {p.cropMeta?.name[lang]}
                      {p.variety ? ` · ${p.variety}` : ''}
                    </span>
                    <span className="mm-text block text-green-800/70">
                      {formatDate(p.plantedOn, lang)} → {formatDate(p.actualHarvestOn, lang)}
                    </span>
                  </span>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
