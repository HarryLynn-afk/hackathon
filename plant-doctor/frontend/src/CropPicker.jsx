export default function CropPicker({ crops, lang, t, onPick }) {
  return (
    <div className="px-4 pb-8">
      <h2 className="mm-text mt-6 text-center text-2xl font-bold text-green-900">
        {t.chooseCrop}
      </h2>
      <p className="mm-text mt-1 mb-6 text-center text-green-800/70">{t.chooseCropHint}</p>
      <div className="grid grid-cols-2 gap-4">
        {crops.map((crop) => (
          <button
            key={crop.id}
            onClick={() => onPick(crop)}
            className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-green-200 bg-white p-4 shadow-sm transition active:scale-95 active:border-green-600"
          >
            <span className="text-6xl" aria-hidden="true">
              {crop.icon}
            </span>
            <span className="mm-text text-xl font-bold text-green-900">
              {crop.name[lang]}
            </span>
            <span className="text-sm text-green-800/60">
              {crop.name[lang === 'mm' ? 'en' : 'mm']}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
