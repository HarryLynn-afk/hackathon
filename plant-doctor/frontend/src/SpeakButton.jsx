import { useEffect, useRef, useState } from 'react'

// Speaker button that fetches Azure TTS audio for `text` on first tap,
// then replays the cached blob instantly on later taps.
export default function SpeakButton({ text, lang, className = '' }) {
  const [state, setState] = useState('idle') // idle | loading | playing | error
  const audioRef = useRef(null)
  const urlRef = useRef(null)

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [text, lang])

  async function toggle() {
    if (state === 'playing') {
      audioRef.current?.pause()
      setState('idle')
      return
    }
    if (state === 'loading' || !text?.trim()) return

    if (audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play()
      setState('playing')
      return
    }

    setState('loading')
    try {
      const resp = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang }),
      })
      if (!resp.ok) throw new Error('http ' + resp.status)
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      const audio = new Audio(url)
      audio.onended = () => setState('idle')
      audio.onerror = () => setState('error')
      audioRef.current = audio
      setState('playing')
      await audio.play()
    } catch {
      setState('error')
    }
  }

  const icon = { idle: '🔊', loading: '⏳', playing: '⏸️', error: '🔇' }[state]

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="listen"
      disabled={state === 'loading'}
      className={`flex items-center justify-center rounded-full transition active:scale-95 disabled:opacity-60 ${className}`}
    >
      {icon}
    </button>
  )
}
