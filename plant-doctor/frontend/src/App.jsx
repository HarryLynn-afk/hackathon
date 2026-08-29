import { useEffect, useState } from 'react'
import { STRINGS } from './i18n'
import { compressImage } from './compressImage'
import CropPicker from './CropPicker'
import PhotoCapture from './PhotoCapture'
import ResultCard from './ResultCard'
import ChatPanel from './ChatPanel'

const FALLBACK_CROPS = []

export default function App() {
  const [lang, setLang] = useState('mm')
  const [step, setStep] = useState('crop') // crop | photo | loading | result | problem
  const [crops, setCrops] = useState(FALLBACK_CROPS)
  const [crop, setCrop] = useState(null)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [problem, setProblem] = useState(null) // notPlant | lowConfidence | error
  const [chatOpen, setChatOpen] = useState(false)

  const t = STRINGS[lang]

  useEffect(() => {
    fetch('/api/crops')
      .then((r) => r.json())
      .then((d) => setCrops(d.crops))
      .catch(() => {})
  }, [])

  function pickCrop(c) {
    setCrop(c)
    setStep('photo')
  }

  async function submitPhoto(file) {
    setStep('loading')
    setPreview(URL.createObjectURL(file))
    try {
      const blob = await compressImage(file)
      const form = new FormData()
      form.append('file', blob, 'photo.jpg')
      form.append('crop', crop.id)
      const resp = await fetch('/api/diagnose', { method: 'POST', body: form })
      if (!resp.ok) throw new Error('http ' + resp.status)
      const data = await resp.json()
      if (data.status === 'not_plant') {
        setProblem('notPlant')
        setStep('problem')
      } else if (data.status === 'low_confidence') {
        setProblem('lowConfidence')
        setStep('problem')
      } else {
        setResult(data)
        setStep('result')
      }
    } catch {
      setProblem('error')
      setStep('problem')
    }
  }

  function restart() {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setResult(null)
    setProblem(null)
    setCrop(null)
    setChatOpen(false)
    setStep('crop')
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg">
      <header className="flex items-center justify-between bg-green-800 px-4 py-3 text-white">
        <h1 className="mm-text text-xl font-bold">🌿 {t.appName}</h1>
        <button
          onClick={() => setLang(lang === 'mm' ? 'en' : 'mm')}
          className="mm-text min-h-11 rounded-xl border-2 border-white/60 px-4 text-lg font-bold"
        >
          {t.langButton}
        </button>
      </header>

      {step === 'crop' && <CropPicker crops={crops} lang={lang} t={t} onPick={pickCrop} />}

      {step === 'photo' && (
        <PhotoCapture crop={crop} lang={lang} t={t} onSubmit={submitPhoto} onBack={restart} />
      )}

      {step === 'loading' && (
        <div className="flex flex-col items-center px-4 pt-16">
          {preview && (
            <img src={preview} alt="plant" className="max-h-64 w-full rounded-2xl border-2 border-green-200 bg-white object-contain" />
          )}
          <div className="mt-8 h-14 w-14 animate-spin rounded-full border-4 border-green-200 border-t-green-700" />
          <p className="mm-text mt-6 text-2xl font-bold text-green-900">{t.analyzing}</p>
          <p className="mm-text mt-2 text-green-800/70">{t.analyzingHint}</p>
        </div>
      )}

      {step === 'result' && result && (
        <>
          <ResultCard result={result} preview={preview} lang={lang} t={t} onNewCheck={restart} />
          {!chatOpen && (
            <button
              onClick={() => setChatOpen(true)}
              className="mm-text fixed bottom-5 right-4 z-40 flex min-h-16 items-center gap-2 rounded-full bg-green-700 px-6 text-xl font-bold text-white shadow-lg transition active:scale-95"
            >
              💬 {t.chatOpen}
            </button>
          )}
          <ChatPanel
            crop={crop}
            diagnosis={result}
            lang={lang}
            t={t}
            open={chatOpen}
            onClose={() => setChatOpen(false)}
          />
        </>
      )}

      {step === 'problem' && (
        <div className="flex flex-col items-center px-4 pt-16">
          <span className="text-6xl" aria-hidden="true">🤔</span>
          <p className="mm-text mt-6 text-center text-xl font-semibold leading-relaxed text-green-900">
            {t[problem]}
          </p>
          <button
            onClick={() => setStep('photo')}
            className="mm-text mt-8 flex min-h-20 w-full items-center justify-center rounded-2xl bg-green-700 text-2xl font-bold text-white shadow-md transition active:scale-95"
          >
            {t.tryAgain}
          </button>
          <button onClick={restart} className="mm-text mt-6 text-lg font-semibold text-green-800/70 underline">
            ← {t.back}
          </button>
        </div>
      )}
    </div>
  )
}
