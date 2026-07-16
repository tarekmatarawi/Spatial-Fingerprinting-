import { useState } from 'react'
import responses from '@/data/survey-responses.json'
import { SURVEY_LENGTH, ATTENTION_CHECKS } from '@/lib/triplets'

// Researcher-side launch panel for Phase 4 (the P4 tab). The survey itself is
// participant-facing and lives at ?survey; here the researcher copies that link
// and opens a preview. Instrument-grade to match the admin/viewer surfaces.
export function SurveyLaunch() {
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}${import.meta.env.BASE_URL}?survey`

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-2xl">
        <p className="font-mono text-xs font-medium tracking-wide text-primary">Phase 4</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Participant survey</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-muted">
          A triplet-comparison study: each participant sees {SURVEY_LENGTH} rounds of three squares
          and marks the two that feel most similar. {ATTENTION_CHECKS} of the rounds are attention
          checks. Responses save to{' '}
          <code className="rounded bg-surface px-1 py-0.5 font-mono text-[13px] text-ink">
            src/data/survey-responses.json
          </code>{' '}
          while running locally.
        </p>

        <div className="mt-8 rounded-2xl border border-line bg-surface p-5">
          <label className="block font-mono text-xs text-ink-muted">Participant link</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
              className="input min-w-0 flex-1 font-mono text-[13px]"
            />
            <button
              onClick={copy}
              className="shrink-0 rounded-full border border-line-strong bg-paper px-4 py-1.5 text-sm font-medium text-ink shadow-sm outline-none transition-colors duration-150 hover:border-primary hover:text-primary-deep focus-visible:ring-2 focus-visible:ring-primary-wash"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-2.5 text-xs text-ink-faint">
            Share this with participants. It opens the survey full-screen with no researcher
            controls.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <a
            href={link}
            className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-white shadow-sm outline-none transition-colors duration-150 hover:bg-primary-deep focus-visible:ring-2 focus-visible:ring-primary-wash focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Open preview
          </a>
          <span className="font-mono text-xs text-ink-faint">
            {responses.length} {responses.length === 1 ? 'submission' : 'submissions'} collected
          </span>
        </div>

        <p className="mt-8 border-t border-line pt-5 text-xs leading-relaxed text-ink-faint">
          Deploy note: on the static/hosted build the local save endpoint isn&rsquo;t present —
          swap in a serverless function (e.g. a Vercel route) at <code className="font-mono">/__save-survey</code>{' '}
          to collect responses from remote participants.
        </p>
      </div>
    </div>
  )
}
