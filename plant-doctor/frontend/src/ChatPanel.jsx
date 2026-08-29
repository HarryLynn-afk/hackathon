import { useEffect, useRef, useState } from 'react'
import SpeakButton from './SpeakButton'
import MicButton from './MicButton'

export default function ChatPanel({ crop, diagnosis, lang, t, open, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [micError, setMicError] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy, open])

  async function send(text) {
    const question = text.trim()
    if (!question || busy) return
    const next = [...messages, { role: 'user', content: question }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crop: crop.id, diagnosis, lang, messages: next }),
      })
      if (!resp.ok) throw new Error('http ' + resp.status)
      const data = await resp.json()
      setMessages([...next, { role: 'assistant', content: data.reply }])
    } catch {
      setMessages([...next, { role: 'assistant', content: t.error }])
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex h-[85vh] w-full max-w-lg flex-col rounded-t-3xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between rounded-t-3xl bg-green-800 px-5 py-4 text-white">
          <h2 className="mm-text text-xl font-bold">💬 {t.chatTitle}</h2>
          <button
            onClick={onClose}
            aria-label={t.chatClose}
            className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/60 text-2xl font-bold"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <Bubble role="assistant" lang={lang}>{t.chatHello}</Bubble>
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} lang={lang}>{m.content}</Bubble>
          ))}
          {busy && (
            <div className="flex items-center gap-2 pl-2 text-green-800/60">
              <span className="h-3 w-3 animate-bounce rounded-full bg-green-600" />
              <span className="h-3 w-3 animate-bounce rounded-full bg-green-600 [animation-delay:120ms]" />
              <span className="h-3 w-3 animate-bounce rounded-full bg-green-600 [animation-delay:240ms]" />
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2 px-4 pb-3">
            {t.chatQuick.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="mm-text rounded-full border-2 border-green-600 bg-green-50 px-4 py-2.5 text-left text-lg font-semibold text-green-900 transition active:scale-95"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {micError && (
          <p className="mm-text px-4 pb-1 text-sm font-semibold text-red-600">{t.micError}</p>
        )}

        <div className="flex items-end gap-2 border-t-2 border-green-100 p-3">
          <MicButton
            lang={lang}
            t={t}
            onTranscript={(text) => {
              setMicError(false)
              if (text) setInput((prev) => (prev ? `${prev} ${text}` : text))
            }}
            onError={() => setMicError(true)}
            className="h-14 w-14 shrink-0 text-2xl"
          />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            placeholder={t.chatPlaceholder}
            rows={1}
            className="mm-text max-h-32 min-h-14 flex-1 resize-none rounded-2xl border-2 border-green-300 bg-white px-4 py-3 text-lg outline-none focus:border-green-600"
          />
          <button
            onClick={() => send(input)}
            disabled={busy || !input.trim()}
            className="mm-text flex min-h-14 items-center justify-center rounded-2xl bg-green-700 px-6 text-lg font-bold text-white transition active:scale-95 disabled:opacity-40"
          >
            {t.chatSend}
          </button>
        </div>
      </div>
    </div>
  )
}

function Bubble({ role, lang, children }) {
  const isUser = role === 'user'
  return (
    <div className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <p
        className={`mm-text max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-lg leading-relaxed ${
          isUser
            ? 'rounded-br-md bg-green-700 text-white'
            : 'rounded-bl-md bg-green-100 text-green-950'
        }`}
      >
        {children}
      </p>
      {!isUser && (
        <SpeakButton
          text={children}
          lang={lang}
          className="h-10 w-10 shrink-0 border-2 border-green-300 bg-white text-lg"
        />
      )}
    </div>
  )
}
