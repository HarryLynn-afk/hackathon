import { useRef, useState } from 'react'

// Lets a farmer speak a question instead of typing. Records a short clip,
// sends it to the backend (which calls ElevenLabs Scribe), and hands the
// transcribed text back to the caller to drop into the chat input.
export default function MicButton({ lang, t, onTranscript, onError, className = '' }) {
  const [state, setState] = useState('idle') // idle | recording | transcribing | error
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  async function start() {
    if (state === 'recording' || state === 'transcribing') return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setState('error')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => sendClip(recorder.mimeType)
      recorderRef.current = recorder
      recorder.start()
      setState('recording')
    } catch {
      setState('error')
      onError?.()
    }
  }

  function stop() {
    if (state !== 'recording') return
    setState('transcribing')
    recorderRef.current?.stop()
    stopStream()
  }

  async function sendClip(mimeType) {
    try {
      const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
      if (blob.size < 500) throw new Error('clip too short')
      const form = new FormData()
      form.append('file', blob, 'voice.webm')
      form.append('lang', lang)
      const resp = await fetch('/api/transcribe', { method: 'POST', body: form })
      if (!resp.ok) throw new Error('http ' + resp.status)
      const data = await resp.json()
      onTranscript(data.text || '')
      setState('idle')
    } catch {
      setState('error')
      onError?.()
    }
  }

  function toggle() {
    if (state === 'recording') stop()
    else start()
  }

  const icon = { idle: '🎤', recording: '⏹️', transcribing: '⏳', error: '⚠️' }[state]
  const label = state === 'recording' ? t.micStop : t.micStart

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={state === 'transcribing'}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center rounded-2xl border-2 transition active:scale-95 disabled:opacity-60 ${
        state === 'recording'
          ? 'animate-pulse border-red-600 bg-red-600 text-white'
          : 'border-green-300 bg-white text-green-800'
      } ${className}`}
    >
      {icon}
    </button>
  )
}
