import { useState } from 'react'
import initialSites from '@/data/sites.json'
import { parseBuildingGeoJSON, parseBoundaryGeoJSON } from '@/lib/geojson'
import { effectiveHeight, heightSource } from '@/lib/site'
import { Button } from '@/components/ui/button'

const DEFAULT_HEIGHT = 12

// German-aware transliteration (ö→oe, ü→ue, ä→ae, ß→ss) so umlauts survive as
// readable ASCII instead of silently vanishing — several site ids (e.g.
// "Römerberg", "Königsplatz", "Düsseldorf") have them.
const UMLAUTS = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' }
function slugify(text) {
  const transliterated = text.replace(/[äöüÄÖÜß]/g, (ch) => UMLAUTS[ch])
  return transliterated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Data-entry page for the 18 sites: paste OSM GeoJSON footprints and a height
// value per building. Saving writes back to src/data/sites.json via the dev
// server; on the deployed static site it falls back to downloading the file.
export function AdminPage() {
  const [sites, setSites] = useState(initialSites)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [buildingText, setBuildingText] = useState('')
  const [boundaryText, setBoundaryText] = useState('')
  const [message, setMessage] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [imageUpload, setImageUpload] = useState({ status: 'idle', error: null }) // idle | uploading | error

  const site = sites[selectedIndex]

  // Each site carries its own default height, applied to pasted buildings that
  // have no OSM height tag. Falls back to DEFAULT_HEIGHT for older data.
  const siteDefaultHeight = site.default_height_m ?? DEFAULT_HEIGHT
  const effectiveDefaultHeight =
    Number(siteDefaultHeight) > 0 ? Number(siteDefaultHeight) : DEFAULT_HEIGHT

  function updateSite(patch) {
    setSites((prev) => prev.map((s, i) => (i === selectedIndex ? { ...s, ...patch } : s)))
    setDirty(true)
  }

  function selectSite(index) {
    setSelectedIndex(index)
    setBuildingText('')
    setBoundaryText('')
    setMessage(null)
    setImageUpload({ status: 'idle', error: null })
  }

  // Uploads a screenshot picked from anywhere on disk to public/images/ via the
  // dev-only endpoint, then fills in the site's street_view_image path. Falls
  // back to a clear inline error on the deployed static site, where the
  // endpoint doesn't exist (same pattern as saving site data).
  async function uploadImage(file) {
    const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      setImageUpload({ status: 'error', error: 'Use a JPG, PNG, or WEBP image.' })
      return
    }
    const filename = `${slugify(site.id)}.${ext}`
    setImageUpload({ status: 'uploading', error: null })
    try {
      const response = await fetch('/__upload-image', {
        method: 'POST',
        headers: { 'x-filename': filename, 'Content-Type': 'application/octet-stream' },
        body: file,
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || `Upload failed (${response.status})`)
      updateSite({ street_view_image: result.path })
      setImageUpload({ status: 'idle', error: null })
    } catch (err) {
      setImageUpload({
        status: 'error',
        error:
          err instanceof TypeError
            ? 'Upload only works when running locally (npm run dev).'
            : err.message,
      })
    }
  }

  function addBuildings() {
    try {
      const parsed = parseBuildingGeoJSON(buildingText)
      const newBuildings = parsed.map((b) => ({
        footprint: b.footprint,
        osm_height_m: b.height_m ?? null,
        override_height_m: null,
      }))
      const fromTags = parsed.filter((b) => b.height_m != null).length
      updateSite({ buildings: [...site.buildings, ...newBuildings] })
      setBuildingText('')
      setMessage({
        kind: 'ok',
        text: `Added ${newBuildings.length} building(s) — ${fromTags} height(s) from OSM tags, ${
          newBuildings.length - fromTags
        } following this site's default (${effectiveDefaultHeight} m). Remember to Save.`,
      })
    } catch (err) {
      setMessage({ kind: 'error', text: err.message })
    }
  }

  function setBoundary() {
    try {
      const boundary = parseBoundaryGeoJSON(boundaryText)
      updateSite({ boundary })
      setBoundaryText('')
      setMessage({ kind: 'ok', text: 'Boundary set. Remember to Save.' })
    } catch (err) {
      setMessage({ kind: 'error', text: err.message })
    }
  }

  function removeBuilding(index) {
    updateSite({ buildings: site.buildings.filter((_, i) => i !== index) })
  }

  // Typing a height pins that building (manual override). Clearing the field
  // removes the pin, so the building falls back to its OSM height or the site
  // default again.
  function setBuildingOverride(index, value) {
    const override = value === '' ? null : Number(value)
    updateSite({
      buildings: site.buildings.map((b, i) =>
        i === index ? { ...b, override_height_m: override } : b
      ),
    })
  }

  async function save() {
    try {
      const response = await fetch('/__save-sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sites),
      })
      if (!response.ok) throw new Error(`save endpoint returned ${response.status}`)
      setDirty(false)
      setMessage({ kind: 'ok', text: 'Saved to src/data/sites.json.' })
    } catch {
      // Deployed static site (or dev server hiccup): offer the file as a download instead
      const blob = new Blob([JSON.stringify(sites, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'sites.json'
      a.click()
      URL.revokeObjectURL(url)
      setMessage({
        kind: 'ok',
        text: 'No dev server found — downloaded sites.json instead. Replace src/data/sites.json with it.',
      })
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg text-ink md:flex-row">
      {/* Site register — full sidebar on desktop, a capped scrollable strip on phones */}
      <aside className="max-h-44 w-full shrink-0 overflow-y-auto border-b border-line bg-surface md:max-h-none md:w-72 md:border-b-0 md:border-r">
        <div className="border-b border-line px-4 py-3.5">
          <h2 className="text-sm font-semibold">Site register</h2>
          <p className="mt-0.5 font-mono text-xs text-ink-muted">
            {sites.length} sites · ✓ boundary set
          </p>
        </div>
        <ul>
          {sites.map((s, i) => (
            <li key={s.id}>
              <button
                onClick={() => selectSite(i)}
                className={`w-full border-b border-line/60 px-4 py-2.5 text-left text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-wash ${
                  i === selectedIndex
                    ? 'bg-primary-wash text-primary-deep'
                    : 'hover:bg-bg'
                }`}
              >
                <span className={`block truncate ${i === selectedIndex ? 'font-medium' : ''}`}>
                  {s.name || s.id}
                </span>
                <span
                  className={`font-mono text-xs ${
                    i === selectedIndex ? 'text-primary' : 'text-ink-muted'
                  }`}
                >
                  {s.city || '—'} · {s.buildings.length} bldg{s.buildings.length === 1 ? '' : 's'}
                  {s.boundary ? ' · ✓' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Editor */}
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-strong pb-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{site.name || site.id}</h1>
              <p className="mt-0.5 font-mono text-xs text-ink-muted">
                {site.city || '—'}
                {site.country ? `, ${site.country}` : ''} · {site.buildings.length} building
                {site.buildings.length === 1 ? '' : 's'}
                {site.boundary ? ' · boundary ✓' : ' · no boundary'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {dirty && <span className="font-mono text-xs text-warn">unsaved changes</span>}
              <Button onClick={save}>Save to sites.json</Button>
            </div>
          </div>

          {message && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                message.kind === 'error'
                  ? 'border-redline/30 bg-redline-wash text-redline'
                  : 'border-ok/30 bg-ok-wash text-ok'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Metadata */}
          <section>
            <SectionHeading>Site info</SectionHeading>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="ID (URL-safe, e.g. gendarmenmarkt-berlin)">
                <input
                  className="input"
                  value={site.id}
                  onChange={(e) => updateSite({ id: e.target.value })}
                />
              </Field>
              <Field label="Name">
                <input
                  className="input"
                  value={site.name}
                  onChange={(e) => updateSite({ name: e.target.value })}
                />
              </Field>
              <Field label="City">
                <input
                  className="input"
                  value={site.city}
                  onChange={(e) => updateSite({ city: e.target.value })}
                />
              </Field>
              <Field label="Country">
                <input
                  className="input"
                  value={site.country}
                  onChange={(e) => updateSite({ country: e.target.value })}
                />
              </Field>
              <Field label="Center latitude">
                <input
                  className="input font-mono"
                  type="number"
                  step="any"
                  value={site.center_lat ?? ''}
                  onChange={(e) =>
                    updateSite({
                      center_lat: e.target.value === '' ? null : Number(e.target.value),
                      default_viewpoint:
                        e.target.value === '' || site.center_lng == null
                          ? site.default_viewpoint
                          : { lat: Number(e.target.value), lng: site.center_lng },
                    })
                  }
                />
              </Field>
              <Field label="Center longitude">
                <input
                  className="input font-mono"
                  type="number"
                  step="any"
                  value={site.center_lng ?? ''}
                  onChange={(e) =>
                    updateSite({
                      center_lng: e.target.value === '' ? null : Number(e.target.value),
                      default_viewpoint:
                        e.target.value === '' || site.center_lat == null
                          ? site.default_viewpoint
                          : { lat: site.center_lat, lng: Number(e.target.value) },
                    })
                  }
                />
              </Field>
              <Field label="Street view image" className="sm:col-span-2">
                <div className="flex items-start gap-3">
                  {site.street_view_image ? (
                    <img
                      key={site.street_view_image}
                      src={`${import.meta.env.BASE_URL}${site.street_view_image.replace(/^\//, '')}`}
                      alt=""
                      className="h-16 w-24 shrink-0 rounded border border-line-strong object-cover"
                      onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                    />
                  ) : (
                    <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded border border-dashed border-line-strong text-[10px] text-ink-faint">
                      No image
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer rounded-full border border-line-strong bg-paper px-3 py-1.5 text-xs font-medium text-ink shadow-sm transition-colors duration-150 hover:border-primary hover:text-primary-deep">
                        {imageUpload.status === 'uploading' ? 'Uploading…' : 'Choose file…'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          disabled={imageUpload.status === 'uploading'}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            if (file) uploadImage(file)
                          }}
                        />
                      </label>
                      {imageUpload.status === 'idle' && site.street_view_image && (
                        <span className="truncate font-mono text-xs text-ink-faint">
                          {site.street_view_image}
                        </span>
                      )}
                    </div>
                    {imageUpload.error && <p className="text-xs text-warn">{imageUpload.error}</p>}
                    <input
                      className="input font-mono text-xs"
                      placeholder="or type a path manually, e.g. /images/site-01.jpg"
                      value={site.street_view_image ?? ''}
                      onChange={(e) => updateSite({ street_view_image: e.target.value })}
                    />
                  </div>
                </div>
              </Field>
            </div>
          </section>

          {/* Boundary */}
          <section>
            <SectionHeading
              trailing={
                site.boundary ? (
                  <span className="font-mono text-xs text-ok">✓ set</span>
                ) : (
                  <span className="font-mono text-xs text-ink-faint">not set</span>
                )
              }
            >
              Plaza boundary
            </SectionHeading>
            <p className="mb-3 text-sm text-ink-muted">
              Paste ONE GeoJSON polygon outlining the open plaza area.
            </p>
            <textarea
              className="input h-28 w-full font-mono text-xs"
              placeholder='{"type":"Polygon","coordinates":[[[lng,lat], …]]}'
              value={boundaryText}
              onChange={(e) => setBoundaryText(e.target.value)}
            />
            <div className="mt-2">
              <Button variant="outline" onClick={setBoundary} disabled={!boundaryText.trim()}>
                Set boundary
              </Button>
            </div>
          </section>

          {/* Buildings */}
          <section>
            <SectionHeading
              trailing={
                <span className="font-mono text-xs text-ink-muted">{site.buildings.length}</span>
              }
            >
              Buildings
            </SectionHeading>
            <p className="mb-3 text-sm text-ink-muted">
              Paste GeoJSON from OSM — a single polygon, or a whole FeatureCollection from an
              overpass-turbo export. Heights are read from OSM tags (height / building:levels)
              when present; otherwise the default below is used. You can correct any height
              afterwards in the list.
            </p>
            <textarea
              className="input h-36 w-full font-mono text-xs"
              placeholder='{"type":"FeatureCollection","features":[…]}'
              value={buildingText}
              onChange={(e) => setBuildingText(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                Default height for this site (m)
                <input
                  className="input w-20 font-mono"
                  type="number"
                  min="1"
                  step="0.1"
                  value={siteDefaultHeight}
                  onChange={(e) =>
                    updateSite({
                      default_height_m: e.target.value === '' ? '' : Number(e.target.value),
                    })
                  }
                />
              </label>
              <Button onClick={addBuildings} disabled={!buildingText.trim()}>
                Add building(s)
              </Button>
            </div>

            {site.buildings.length > 0 && (
              <ul className="mt-4 divide-y divide-line/60 border-t border-line">
                {site.buildings.map((b, i) => {
                  const source = heightSource(b)
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 text-sm">
                      <span className="w-8 font-mono text-xs text-ink-faint">{i + 1}</span>
                      <span className="min-w-32 flex-1 text-ink-muted">
                        {b.footprint.coordinates[0].length - 1} corner polygon
                      </span>
                      <HeightBadge source={source} />
                      <label className="flex items-center gap-1 text-ink-muted">
                        <input
                          className="input w-20 font-mono"
                          type="number"
                          step="0.1"
                          value={effectiveHeight(b, site)}
                          onChange={(e) => setBuildingOverride(i, e.target.value)}
                        />
                        m
                      </label>
                      <Button variant="ghost" size="sm" onClick={() => removeBuilding(i)}>
                        remove
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

// Section headings sit on a hairline rule, like annotations on a drawing sheet.
function SectionHeading({ children, trailing }) {
  return (
    <div className="mb-3 flex items-baseline justify-between border-b border-line pb-1.5">
      <h2 className="text-sm font-semibold">{children}</h2>
      {trailing}
    </div>
  )
}

function Field({ label, children, className = '' }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block text-ink-muted">{label}</span>
      {children}
    </label>
  )
}

const HEIGHT_BADGES = {
  osm: { label: 'OSM', className: 'bg-ok-wash text-ok' },
  default: { label: 'default', className: 'bg-surface text-ink-muted' },
  manual: { label: 'pinned', className: 'bg-primary-wash text-primary' },
}

function HeightBadge({ source }) {
  const badge = HEIGHT_BADGES[source] ?? HEIGHT_BADGES.default
  return (
    <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-medium uppercase ${badge.className}`}>
      {badge.label}
    </span>
  )
}
