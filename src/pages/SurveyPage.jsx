import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import sites from '@/data/sites.json'
import { assembleSurvey, SURVEY_LENGTH } from '@/lib/triplets'

// Phase 4 — the participant-facing triplet survey. This is the one surface in
// the platform that is NOT instrument-grade: it strips down to a single,
// unambiguous task (pick the two squares that feel most similar) with no
// researcher chrome, per the "one tool, two densities" product principle.
//
// Reached bare at ?survey; the researcher previews/links it from the P4 tab.

const INSTRUCTION =
  'Which two of these three spaces feel most similar in terms of how open, enclosed, or spatially complex they feel? Judge by the sense of space — not architectural style or surface materials.'

const siteById = new Map(sites.map((s) => [s.id, s]))
const ALL_SITE_IDS = sites.map((s) => s.id)

export function SurveyPage() {
  const [stage, setStage] = useState('intro') // intro | survey | background | done
  const [index, setIndex] = useState(0)
  const [responses, setResponses] = useState([])
  const [submitState, setSubmitState] = useState('idle') // idle | saving | saved | failed

  // One stable participant id + survey plan for the whole session.
  const participantId = useMemo(() => crypto.randomUUID(), [])
  const startedAt = useMemo(() => new Date().toISOString(), [])
  const survey = useMemo(() => assembleSurvey(ALL_SITE_IDS, participantId), [participantId])

  const submit = useCallback(
    async (background) => {
      setSubmitState('saving')
      const payload = {
        participant_id: participantId,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        background, // 'yes' | 'no' | 'undisclosed'
        responses,
      }
      try {
        const res = await fetch('/__save-survey', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(String(res.status))
        setSubmitState('saved')
      } catch {
        setSubmitState('failed')
      }
      setStage('done')
    },
    [participantId, startedAt, responses]
  )

  function handleChoice(chosenPair) {
    const triplet = survey[index]
    const [a, b, c] = triplet.site_ids
    setResponses((prev) => [
      ...prev,
      {
        participant_id: participantId,
        triplet_id: triplet.triplet_id,
        order: triplet.order,
        site_a: a,
        site_b: b,
        site_c: c,
        chosen_pair: chosenPair,
        is_attention_check: triplet.is_attention_check,
        timestamp: new Date().toISOString(),
      },
    ])
    if (index + 1 < survey.length) setIndex((i) => i + 1)
    else setStage('background')
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-bg text-ink">
      {stage === 'intro' && <Intro onBegin={() => setStage('survey')} />}
      {stage === 'survey' && (
        <Round
          key={survey[index].triplet_id}
          triplet={survey[index]}
          position={index + 1}
          total={survey.length}
          onChoice={handleChoice}
        />
      )}
      {stage === 'background' && <Background onAnswer={submit} pending={submitState === 'saving'} />}
      {stage === 'done' && <Done submitState={submitState} />}
    </div>
  )
}

// ---- Intro ------------------------------------------------------------------

function Intro({ onBegin }) {
  return (
    <Frame>
      <div className="mx-auto w-full max-w-xl">
        <p className="font-mono text-xs font-medium tracking-wide text-primary">
          Spatial perception study
        </p>
        <h1 className="mt-3 text-pretty text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
          How similar do these public squares feel?
        </h1>
        <p className="mt-5 max-w-prose text-base leading-relaxed text-ink-muted">
          You&rsquo;ll see three public squares at a time and choose the two that feel most alike as
          spaces. There are no right answers — we&rsquo;re studying first impressions of space, so go
          with instinct rather than deliberating.
        </p>

        <div className="mt-7 border-t border-line pt-6">
          <p className="max-w-prose text-base leading-relaxed text-ink">{INSTRUCTION}</p>
        </div>

        <dl className="mt-7 flex flex-wrap gap-x-10 gap-y-3 font-mono text-xs text-ink-faint">
          <div>
            <dt className="text-ink-muted">Rounds</dt>
            <dd className="mt-0.5 text-sm text-ink">{SURVEY_LENGTH} comparisons</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Time</dt>
            <dd className="mt-0.5 text-sm text-ink">about 5 minutes</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Sign-in</dt>
            <dd className="mt-0.5 text-sm text-ink">none — fully anonymous</dd>
          </div>
        </dl>

        <div className="mt-9">
          <button
            onClick={onBegin}
            className="w-full rounded-full bg-primary px-8 py-3 text-base font-medium text-white shadow-sm outline-none transition-colors duration-150 hover:bg-primary-deep focus-visible:ring-2 focus-visible:ring-primary-wash focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:w-auto"
          >
            Begin
          </button>
        </div>
      </div>
    </Frame>
  )
}

// ---- Round ------------------------------------------------------------------

function Round({ triplet, position, total, onChoice }) {
  // Selection is tracked by panel index (0/1/2), not site id, so an attention
  // check that repeats one plaza twice still resolves to two distinct panels.
  const [selected, setSelected] = useState([]) // queue of panel indices, max 2
  const containerRef = useRef(null)

  const toggle = useCallback((panelIdx) => {
    setSelected((prev) => {
      if (prev.includes(panelIdx)) return prev.filter((i) => i !== panelIdx)
      if (prev.length < 2) return [...prev, panelIdx]
      return [prev[1], panelIdx] // drop the oldest, keep it a rolling pair
    })
  }, [])

  const ready = selected.length === 2

  const confirm = useCallback(() => {
    if (!ready) return
    const pair = selected.map((i) => triplet.site_ids[i])
    onChoice(pair)
  }, [ready, selected, triplet, onChoice])

  // Keyboard: 1/2/3 toggle a panel, Enter confirms once two are chosen.
  useEffect(() => {
    function onKey(e) {
      if (e.key === '1' || e.key === '2' || e.key === '3') {
        toggle(Number(e.key) - 1)
      } else if (e.key === 'Enter') {
        confirm()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, confirm])

  const pct = Math.round(((position - 1) / total) * 100)

  return (
    <Frame>
      {/* Wide container so the three street views dominate the screen on any
          monitor; on phones they stack full-width instead of shrinking. */}
      <div className="mx-auto flex w-full max-w-6xl flex-col 2xl:max-w-[88rem]" ref={containerRef}>
        {/* Progress */}
        <div className="flex items-center gap-4">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-xs text-ink-faint">
            {String(position).padStart(2, '0')} / {total}
          </span>
        </div>

        {/* Task */}
        <h2 className="mt-6 text-pretty text-lg font-medium text-ink sm:mt-8 sm:text-xl">
          Select the <span className="text-primary">two</span> squares that feel most similar.
        </h2>
        <p className="mt-1.5 text-sm text-ink-muted sm:text-base">
          By the sense of space — how open, enclosed, or complex — not style or materials.
        </p>

        {/* Choices */}
        <fieldset className="mt-5 grid grid-cols-1 gap-4 sm:mt-6 sm:grid-cols-3 sm:gap-5 xl:gap-6">
          <legend className="sr-only">Choose the two most similar squares</legend>
          {triplet.site_ids.map((id, i) => (
            <PlazaCard
              key={i}
              site={siteById.get(id)}
              panelIndex={i}
              selected={selected.includes(i)}
              order={selected.indexOf(i)}
              onToggle={() => toggle(i)}
            />
          ))}
        </fieldset>

        {/* Action */}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:mt-7 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="text-center text-sm text-ink-muted sm:text-left" aria-live="polite">
            {selected.length === 0 && 'Tap two squares to compare.'}
            {selected.length === 1 && 'One more — pick its closest match.'}
            {ready && 'These two feel most similar to you.'}
          </p>
          <button
            onClick={confirm}
            disabled={!ready}
            className="w-full rounded-full bg-primary px-8 py-3 text-base font-medium text-white shadow-sm outline-none transition-colors duration-150 enabled:hover:bg-primary-deep disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-ink-faint focus-visible:ring-2 focus-visible:ring-primary-wash focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:w-auto"
          >
            {position === total ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </Frame>
  )
}

function PlazaCard({ site, panelIndex, selected, order, onToggle }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`group relative overflow-hidden rounded-2xl border text-left outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-primary-wash focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
        selected
          ? 'border-accent ring-2 ring-accent'
          : 'border-line hover:border-line-strong'
      }`}
    >
      <PlazaImage site={site} />
      {/* Selection wash + badge */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-150 ${
          selected ? 'bg-accent/10 opacity-100' : 'opacity-0'
        }`}
      />
      <span
        aria-hidden
        className={`absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full font-mono text-sm font-medium shadow-sm transition-all duration-150 ${
          selected ? 'scale-100 bg-primary text-white' : 'scale-0 bg-primary text-white'
        }`}
      >
        {order === 0 ? '1' : '2'}
      </span>
      <div className="flex items-baseline justify-between gap-2 border-t border-line bg-paper px-3.5 py-3">
        <span className="truncate text-sm font-medium text-ink sm:text-base">
          {site?.name ?? 'Unknown'}
        </span>
        <span className="shrink-0 font-mono text-xs text-ink-faint">{site?.city}</span>
      </div>
    </button>
  )
}

// A Street View photo when present; otherwise a dignified plan-view placeholder
// (plaza name over a faint drafting glyph) instead of a broken-image icon, so
// the survey is fully usable before the 18 photos are added.
function PlazaImage({ site }) {
  const [failed, setFailed] = useState(false)
  const src = site?.street_view_image
    ? import.meta.env.BASE_URL + site.street_view_image.replace(/^\//, '')
    : null

  if (!src || failed) {
    return (
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-surface">
        <PlanGlyph />
        <span className="relative px-4 text-center text-sm font-medium text-ink-muted">
          {site?.name ?? 'Unknown square'}
        </span>
      </div>
    )
  }

  return (
    <div className="aspect-[4/3] overflow-hidden bg-surface">
      <img
        src={src}
        alt={`View across ${site?.name}, ${site?.city}`}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
      />
    </div>
  )
}

function PlanGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 120"
      className="absolute inset-0 h-full w-full text-line-strong"
      fill="none"
      stroke="currentColor"
    >
      <rect x="24" y="24" width="72" height="72" strokeWidth="1" />
      <rect x="42" y="42" width="36" height="36" strokeWidth="1" />
      <path d="M60 6v18M60 96v18M6 60h18M96 60h18" strokeWidth="1" />
    </svg>
  )
}

// ---- Background -------------------------------------------------------------

function Background({ onAnswer, pending }) {
  return (
    <Frame>
      <div className="mx-auto w-full max-w-lg">
        <p className="font-mono text-xs font-medium tracking-wide text-primary">One last question</p>
        <h2 className="mt-3 text-pretty text-2xl font-semibold tracking-tight text-ink">
          Do you have a background in architecture, urban design, or planning?
        </h2>
        <p className="mt-3 text-base text-ink-muted">
          Optional. It helps us understand how training shapes spatial judgement.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <BackgroundButton disabled={pending} onClick={() => onAnswer('yes')}>
            Yes
          </BackgroundButton>
          <BackgroundButton disabled={pending} onClick={() => onAnswer('no')}>
            No
          </BackgroundButton>
        </div>

        <button
          disabled={pending}
          onClick={() => onAnswer('undisclosed')}
          className="mt-6 self-start text-sm text-ink-faint underline-offset-4 outline-none transition-colors duration-150 hover:text-ink-muted hover:underline focus-visible:ring-2 focus-visible:ring-primary-wash disabled:opacity-50"
        >
          Prefer not to say
        </button>
      </div>
    </Frame>
  )
}

function BackgroundButton({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="min-w-28 rounded-full border border-line-strong bg-paper px-7 py-3 text-base font-medium text-ink shadow-sm outline-none transition-colors duration-150 hover:border-primary hover:bg-primary-wash hover:text-primary-deep focus-visible:ring-2 focus-visible:ring-primary-wash disabled:opacity-50"
    >
      {children}
    </button>
  )
}

// ---- Done -------------------------------------------------------------------

function Done({ submitState }) {
  return (
    <Frame>
      <div className="mx-auto w-full max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-wash">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-primary" fill="none" stroke="currentColor">
            <path d="M5 13l4 4L19 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="mt-6 text-2xl font-semibold tracking-tight text-ink">Thank you.</h2>
        <p className="mt-3 text-base leading-relaxed text-ink-muted">
          {submitState === 'failed'
            ? 'Your answers were recorded on this device, but couldn’t reach the server. If you’re testing locally, that’s expected.'
            : 'Your responses have been recorded. They’ll help test how the geometry of a public square shapes the way it feels.'}
        </p>
        <p className="mt-8 font-mono text-xs text-ink-faint">You can close this tab.</p>
      </div>
    </Frame>
  )
}

// ---- Shared frame -----------------------------------------------------------

// Centers each stage in the viewport, but grows (and lets the root scroll) when
// a stage is taller than the screen — so nothing clips on short/mobile views.
function Frame({ children }) {
  return (
    <div className="flex min-h-full flex-col justify-center px-5 py-10 sm:px-8">{children}</div>
  )
}
