import { useState } from 'react'
import initialSites from '@/data/sites.json'
import { parseBuildingGeoJSON, parseBoundaryGeoJSON } from '@/lib/geojson'
import { effectiveHeight, heightSource } from '@/lib/site'
import { Button } from '@/components/ui/button'

const DEFAULT_HEIGHT = 12

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
    <div className="flex h-full overflow-hidden bg-slate-50 text-slate-900">
      {/* Site list */}
      <aside className="w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-semibold">Sites ({sites.length})</h2>
          <p className="mt-1 text-xs text-slate-500">
            ✓ = boundary set · n = buildings entered
          </p>
        </div>
        <ul>
          {sites.map((s, i) => (
            <li key={s.id}>
              <button
                onClick={() => selectSite(i)}
                className={`w-full border-b border-slate-100 px-4 py-2.5 text-left text-sm hover:bg-slate-50 ${
                  i === selectedIndex ? 'bg-blue-50 font-medium' : ''
                }`}
              >
                <span className="block truncate">{s.name || s.id}</span>
                <span className="text-xs text-slate-500">
                  {s.city || '—'} · {s.buildings.length} bldg{s.buildings.length === 1 ? '' : 's'}
                  {s.boundary ? ' · ✓ boundary' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Editor */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">{site.name || site.id}</h1>
            <div className="flex items-center gap-3">
              {dirty && <span className="text-sm text-amber-600">unsaved changes</span>}
              <Button onClick={save}>Save to sites.json</Button>
            </div>
          </div>

          {message && (
            <div
              className={`rounded-md border p-3 text-sm ${
                message.kind === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-green-200 bg-green-50 text-green-700'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Metadata */}
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 font-medium">Site info</h2>
            <div className="grid grid-cols-2 gap-3">
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
                  className="input"
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
                  className="input"
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
              <Field label="Street view image path" className="col-span-2">
                <input
                  className="input"
                  value={site.street_view_image ?? ''}
                  onChange={(e) => updateSite({ street_view_image: e.target.value })}
                />
              </Field>
            </div>
          </section>

          {/* Boundary */}
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-1 font-medium">
              Plaza boundary {site.boundary ? '✓' : '(not set)'}
            </h2>
            <p className="mb-3 text-sm text-slate-500">
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
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-1 font-medium">Buildings ({site.buildings.length})</h2>
            <p className="mb-3 text-sm text-slate-500">
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
            <div className="mt-2 flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                Default height for this site (m)
                <input
                  className="input w-20"
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
              <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
                {site.buildings.map((b, i) => {
                  const source = heightSource(b)
                  return (
                    <li key={i} className="flex items-center gap-3 py-2 text-sm">
                      <span className="w-8 text-slate-400">#{i + 1}</span>
                      <span className="flex-1 text-slate-600">
                        {b.footprint.coordinates[0].length - 1} corner polygon
                      </span>
                      <HeightBadge source={source} />
                      <label className="flex items-center gap-1 text-slate-600">
                        <input
                          className="input w-20"
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

function Field({ label, children, className = '' }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block text-slate-600">{label}</span>
      {children}
    </label>
  )
}

const HEIGHT_BADGES = {
  osm: { label: 'OSM', className: 'bg-green-100 text-green-700' },
  default: { label: 'default', className: 'bg-slate-100 text-slate-500' },
  manual: { label: 'pinned', className: 'bg-blue-100 text-blue-700' },
}

function HeightBadge({ source }) {
  const badge = HEIGHT_BADGES[source] ?? HEIGHT_BADGES.default
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${badge.className}`}>
      {badge.label}
    </span>
  )
}
