import { useRef, useState } from 'react'

export default function PhotoCapture({ crop, lang, t, onSubmit, onBack }) {
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)

  function handleFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  function reset() {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
    if (cameraRef.current) cameraRef.current.value = ''
    if (galleryRef.current) galleryRef.current.value = ''
  }

  return (
    <div className="flex flex-col px-4 pb-8">
      <div className="mt-6 flex items-center justify-center gap-3">
        <span className="text-4xl" aria-hidden="true">{crop.icon}</span>
        <span className="mm-text text-2xl font-bold text-green-900">{crop.name[lang]}</span>
      </div>

      {!preview ? (
        <>
          <p className="mm-text mt-2 mb-8 text-center text-green-800/70">{t.photoHint}</p>
          <button
            onClick={() => cameraRef.current?.click()}
            className="mm-text flex min-h-24 w-full items-center justify-center gap-4 rounded-2xl bg-green-700 text-2xl font-bold text-white shadow-md transition active:scale-95"
          >
            <CameraIcon />
            {t.takePhoto}
          </button>
          <button
            onClick={() => galleryRef.current?.click()}
            className="mm-text mt-4 flex min-h-24 w-full items-center justify-center gap-4 rounded-2xl border-2 border-green-700 bg-white text-2xl font-bold text-green-800 transition active:scale-95"
          >
            <GalleryIcon />
            {t.uploadPhoto}
          </button>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </>
      ) : (
        <>
          <img
            src={preview}
            alt="plant"
            className="mt-4 max-h-96 w-full rounded-2xl border-2 border-green-200 object-contain bg-white"
          />
          <button
            onClick={() => onSubmit(file)}
            className="mm-text mt-6 flex min-h-24 w-full items-center justify-center rounded-2xl bg-green-700 text-2xl font-bold text-white shadow-md transition active:scale-95"
          >
            {t.checkDisease}
          </button>
          <button
            onClick={reset}
            className="mm-text mt-4 flex min-h-16 w-full items-center justify-center rounded-2xl border-2 border-green-700 bg-white text-xl font-bold text-green-800 transition active:scale-95"
          >
            {t.retake}
          </button>
        </>
      )}

      <button onClick={onBack} className="mm-text mt-8 text-center text-lg font-semibold text-green-800/70 underline">
        ← {t.back}
      </button>
    </div>
  )
}

function CameraIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function GalleryIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  )
}
