import SpeakButton from './SpeakButton'

const SEVERITY_STYLES = {
  low: 'bg-green-100 text-green-900 border-green-400',
  medium: 'bg-amber-100 text-amber-900 border-amber-400',
  high: 'bg-red-100 text-red-900 border-red-400',
}

function buildSpeechText(result, lang, t, healthy) {
  const parts = healthy ? [t.healthy] : [result.disease?.[lang]]
  if (!healthy && result.cause?.[lang]) parts.push(result.cause[lang])
  for (const step of result.treatment_steps || []) {
    if (step[lang]) parts.push(step[lang])
  }
  if (!healthy && result.prevention?.[lang]) parts.push(result.prevention[lang])
  return parts.filter(Boolean).join('. ')
}

export default function ResultCard({ result, preview, lang, t, onNewCheck }) {
  const sev = result.severity in SEVERITY_STYLES ? result.severity : 'medium'
  const sevLabel = { low: t.severityLow, medium: t.severityMedium, high: t.severityHigh }[sev]
  const healthy = result.is_healthy
  const speechText = buildSpeechText(result, lang, t, healthy)

  return (
    <div className="px-4 pb-10">
      {preview && (
        <img src={preview} alt="plant" className="mt-4 max-h-56 w-full rounded-2xl border-2 border-green-200 bg-white object-contain" />
      )}

      <div className={`mm-text mt-4 rounded-2xl border-2 p-5 ${healthy ? SEVERITY_STYLES.low : SEVERITY_STYLES[sev]}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold opacity-70">{t.disease}</p>
            <h2 className="mm-text mt-1 text-3xl font-bold leading-snug">
              {healthy ? t.healthy : result.disease[lang]}
            </h2>
          </div>
          <SpeakButton
            text={speechText}
            lang={lang}
            className="h-14 w-14 shrink-0 border-2 border-current bg-white/40 text-2xl"
          />
        </div>
        {!healthy && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-lg font-semibold">
            <span className="rounded-full border-2 border-current px-4 py-1">
              {t.severity}: {sevLabel}
            </span>
            <span className="opacity-70">
              {t.confidence} {Math.round((result.confidence ?? 0) * 100)}%
            </span>
          </div>
        )}
      </div>

      {!healthy && result.cause && (
        <Section title={t.cause}>
          <p className="mm-text text-lg leading-relaxed">{result.cause[lang]}</p>
        </Section>
      )}

      {result.treatment_steps?.length > 0 && (
        <Section title={t.treatment}>
          <ol className="space-y-4">
            {result.treatment_steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-700 text-lg font-bold text-white">
                  {i + 1}
                </span>
                <p className="mm-text text-lg leading-relaxed">{step[lang]}</p>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {!healthy && result.medicines?.length > 0 && (
        <Section title={`💊 ${t.medicines}`}>
          <div className="space-y-3">
            {result.medicines.map((med, i) => (
              <div key={i} className="rounded-xl border-2 border-green-100 bg-green-50/60 p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="mm-text text-xl font-bold text-green-900">
                    {med.name_mm}
                  </span>
                  <span className="text-lg font-semibold text-green-800/80">
                    {med.name_en}
                  </span>
                </div>
                {(med.company_mm || med.company_en) && (
                  <p className="mm-text mt-1 text-base font-semibold text-green-800/80">
                    🏭 {lang === 'mm' ? med.company_mm || med.company_en : med.company_en || med.company_mm}
                  </p>
                )}
                {med.ingredient && (
                  <p className="mt-1 text-base text-green-800/60">{med.ingredient}</p>
                )}
                {med.note && (
                  <p className="mm-text mt-2 text-lg leading-relaxed">{med.note[lang]}</p>
                )}
              </div>
            ))}
          </div>
          <p className="mm-text mt-3 text-base text-green-900/60">{t.medicinesHint}</p>
        </Section>
      )}

      {!healthy && result.prevention && (
        <Section title={t.prevention}>
          <p className="mm-text text-lg leading-relaxed">{result.prevention[lang]}</p>
        </Section>
      )}

      <p className="mm-text mt-6 rounded-xl bg-green-900/5 p-4 text-center text-green-900/70">
        {t.disclaimer}
      </p>

      <button
        onClick={onNewCheck}
        className="mm-text mt-6 flex min-h-20 w-full items-center justify-center rounded-2xl bg-green-700 text-2xl font-bold text-white shadow-md transition active:scale-95"
      >
        {t.newCheck}
      </button>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mt-4 rounded-2xl border-2 border-green-200 bg-white p-5">
      <h3 className="mm-text mb-3 text-xl font-bold text-green-900">{title}</h3>
      {children}
    </div>
  )
}
