# Spatial Fingerprinting — Web Platform Build Specification

Phased build spec for the research platform. Phases are executed **one at a time, in order**, with validation before moving on.

---

## Project Overview

A research web platform for a master's thesis in urban design called "Spatial Fingerprinting." The platform:

1. Displays 18 real public plazas (European city squares) as 3D models built from building footprints and heights
2. Lets a user click any point inside a plaza and computes four geometric metrics from that point: isovist area, compactness, occlusivity, and enclosure ratio
3. Runs a perceptual survey (triplet comparison: "which two of these three plazas feel most spatially similar?") and stores responses
4. Fits perceptual weights for the four metrics from survey data using softmax-based maximum likelihood optimization
5. Displays clustering, hypothesis test results, and a design-diagnostic tool

Accuracy of the geometry engine matters more than speed of delivery.

Tech stack: React + Three.js for the 3D viewer; backend architecture for survey storage and weight fitting to be decided at Phase 4 (leading option: GitHub Pages frontend + Supabase for responses + local Python script for fitting).

---

## Design System

The frontend carries a "drafting instrument" visual identity — see [PRODUCT.md](../PRODUCT.md) for the full brief — re-based on the environment-settings design tokens (July 2026). Warm cream paper surfaces (`#F4F2EC` page / `#EAE6DB` panels), near-black ink, and orange as the technical-pen brand color: the reference's `#F97316`/`#EA580C` carries graphic accents (progress bars, selection rings, isovist fill) while text and buttons use a darker AA-safe cut of the same hue. Redline red stays reserved for markup (viewpoint marker, warnings, wall hits). Typography is Inter for UI text and JetBrains Mono for data/coordinates/labels; primary actions are pill-shaped, cards/panels rounded. All tokens live in `src/index.css` as OKLCH `--color-*` variables. Every subsequent phase's UI (results dashboard) should extend this system rather than introduce new visual language — keep the researcher's dense working surfaces and the single-task participant survey feeling like the same family at different densities.

---

## PHASE 1 — Data Model & Site Setup

Foundational data structure, no computation.

**Task:** Create a `sites.json` schema seeded with entries for 18 sites. Each site:

```json
{
  "id": "gendarmenmarkt-berlin",
  "name": "Gendarmenmarkt",
  "city": "Berlin",
  "country": "Germany",
  "center_lat": 52.5136,
  "center_lng": 13.3919,
  "boundary": { "type": "Polygon", "coordinates": [[["lng", "lat"], "..."]] },
  "buildings": [
    {
      "footprint": { "type": "Polygon", "coordinates": [[["lng", "lat"], "..."]] },
      "height_m": 24.5
    }
  ],
  "default_viewpoint": { "lat": 52.5136, "lng": 13.3919 },
  "street_view_image": "/images/gendarmenmarkt.jpg"
}
```

Plus a simple admin/data-entry page: paste a building footprint (GeoJSON from OpenStreetMap) and a height value, and it appends correctly to a site's `buildings` array. All 18 sites' geometry is populated manually via OSM export — the tool accepts this data, it does not source it automatically (OSM height data is unreliable).

**Gate: do not proceed to Phase 2 until the data structure is confirmed working and at least 2 sites are populated with real building data.**

---

## PHASE 2 — 3D Viewer (Visualization Only, No Metrics Yet)

**Task:** A Three.js scene that:

- Loads a selected site's `boundary` and `buildings` from `sites.json`
- Renders each building as an extruded polygon (footprint extruded up by `height_m`)
- Renders the plaza's open boundary as a ground plane
- Camera orbit/pan/zoom
- Click anywhere inside the plaza boundary → place a visible marker (small sphere) at that point and log its coordinates
- After placing the vantage point, a second click sets a **viewing direction** (facing bearing) — load-bearing for both the isovist and the enclosure ratio in Phase 3, since both share the same 120° cone centered on it

**Validation before Phase 3:** load a real site; confirm buildings appear at correct relative heights and positions; confirm clicking places a marker at the correct location (not offset or inverted); confirm the viewing direction can be set and read back correctly.

**Status: done.** Click-to-place + click-to-aim implemented in `SiteViewer.jsx` — first click places the vantage point (with a default facing direction toward the plaza centroid), second click re-aims it; a "Move viewpoint" button restarts the cycle.

---

## PHASE 3 — Unified Ray-Casting Engine (THE CRITICAL PHASE)

The most important and error-prone phase. Follow exactly — do not approximate the geometry logic.

### Design: unified single-cone ray-casting

Isovist and Enclosure Ratio are computed from **one shared ray-casting pass**, not two independent ones — same vantage point, same viewing direction, same 120° field of view, same 200 m range.

**Inputs:**
- Vantage point `(x0, y0)` — the clicked point; planar 2D isovist to start (see note below)
- Viewing direction — set via the second click in Phase 2 (facing bearing)
- Field of view: **120°**, centered on the viewing direction
- The site's building footprint polygons (obstacles), each with an effective height
- Max ray length `max_vista = 200 m`
- Ray count: **120 rays** (1 ray per degree across the 120° cone) — matches the original Grasshopper "Precision" setting (1 ray/degree)

**Algorithm:**
1. Cast 120 rays evenly spaced across the 120° FOV, centered on the viewing direction, from `(x0, y0)`.
2. Test each ray against every building footprint edge (line segment) in the site.
3. Record the **nearest intersection** per ray, and the height of the building hit (if any). No intersection within `max_vista` → terminate at `max_vista`, flag as **open**. Hit a wall → terminate there, flag as **wall** (with the building's height).
4. The isovist polygon is the vantage point plus the ordered ray endpoints (sorted by angle) — the vantage point itself closes the two side edges of the cone, since a 120° wedge isn't a full loop of ray endpoints alone.
5. Separately, the `(height, distance)` pairs from only the wall-hit rays feed the Enclosure Ratio.

**Metric formulas — confirmed against real Grasshopper output (Gendarmenmarkt, Berlin):**

Given the isovist polygon vertices `(xᵢ, yᵢ)` relative to the vantage point:

- **Area** (shoelace): `Area = |Σ (x[i-1]·y[i] − x[i]·y[i-1])| / 2`
- **Perimeter**: `Σ sqrt((x[i]−x[i-1])² + (y[i]−y[i-1])²)` over all polygon edges (wall-bound and range-bound)
- **Compactness** (isoperimetric quotient): `(4π × Area) / Perimeter²`
- **Occlusivity — closed perimeter (Uv), a raw length in meters, NOT a 0–1 ratio:** `Σ sqrt((x[i]−x[i-1])² + (y[i]−y[i-1])²)` over consecutive vertex pairs where **both** are wall-type. Do **not** implement `1 − Uv/Perimeter` (Benedikt's normalized ratio) — confirmed via reverse calculation that this does not match the existing 18-site dataset.
- **Enclosure Ratio**: `average(hᵢ / dᵢ)` over all rays `i` that hit a building within 200 m — `hᵢ` is the hit building's height, `dᵢ` the horizontal distance from the vantage point. Open rays (no hit) are excluded from the average, not treated as 0. The existing 18-site dataset's Enclosure Ratio values were already computed at the 120° cone (not 360°), so the reference value below is a valid validation target.

**Gendarmenmarkt validation reference (from Grasshopper):**

| Metric | Reference value |
|---|---|
| Isovist Area | 12437.877366 m² |
| Compactness | 0.269934 |
| Occlusivity (closed perimeter) | 354.097561 m |
| Enclosure Ratio | 0.330407 |

**Validation gate before Phase 4:** compute all four metrics for Gendarmenmarkt and compare against the table above (~2–3% tolerance; >10–15% indicates a bug — most likely candidates: angle convention, vertex ordering before the shoelace formula, or wall/open misclassification). The exact original Grasshopper vantage point/direction were not recorded, so an exact match isn't expected — treat this as a soft sanity check on order of magnitude and internal consistency, not a byte-for-byte match.

**Implementation note:** start with a **planar (2D) isovist** — matches what Decoding Spaces computes and is far simpler to get correct. True 3D isovist only after 2D is fully validated.

### 3D Visualization (build alongside the engine)

- **Isovist polygon**: flat, semi-transparent polygon at ground level from the shared ray pass.
- **Enclosure profile**: a ribbon rising from ground to each wall-hit ray's building height, connected in ray order, breaking at open rays — reads as a partial "fence" tracing the enclosing buildings within the cone.
- Both update live as the vantage point or viewing direction change.

**Status: done.** Implemented in `src/lib/isovist.js` (ray-casting + metrics) and `src/components/IsovistOverlay.jsx` (live polygon + ribbon rendering), wired into `SiteViewer.jsx`. Best-effort validated against the Gendarmenmarkt reference above (Area/Compactness/Occlusivity within ~5–11% at an arbitrary vantage point; Enclosure Ratio further off, expected since the original point wasn't reproduced exactly). No console errors; visually confirmed the isovist wedge and enclosure ribbon render correctly, bounded by real building facades.

---

## PHASE 4 — Survey Module

- Participant lands on a survey URL, no login, gets a randomly assigned / pre-balanced set of 28 triplets
- Each triplet: 3 site images (pre-uploaded Street View, not live API) side by side
- Instruction: "Which two of these three spaces feel most similar in terms of how open, enclosed, or spatially complex they feel? Please judge based on the sense of space, not architectural style or surface materials."
- Participant picks a pair; stored as `{ participant_id, triplet_id, site_a, site_b, site_c, chosen_pair, timestamp }`
- 2 attention-check triplets with an obvious extreme pair, flagged separately
- Thank-you screen; only optional self-report field: "Do you have a background in architecture, urban design, or planning? Yes/No" (for the rater-expertise limitations analysis)

**Balanced triplet sampling:** with 18 sites, generate a pool where every pair of sites appears together at least 2–3 times; randomly assign 28-triplet subsets per participant, tracked so participants don't see heavily overlapping sets (some overlap fine).

---

## PHASE 5 — Weight Fitting Backend

Given all survey responses and the 18 sites' 4 metrics (normalized 0–1 across sites), fit 4 perceptual weights by maximum likelihood:

For each response `(site_a, site_b, site_c, chosen_pair)`:
- Weighted distance per pair: `d(x,y) = sqrt(Σ wₖ (xₖ − yₖ)²)` over the 4 metrics
- Softmax choice probability: `P(pair) = exp(−d(pair)²) / Σ exp(−d(other pairs)²)`
- NLL contribution: `−log(P(chosen_pair))`

Minimize total NLL over `w1..w4` (constrain positive, e.g. optimize in log-space) with L-BFGS-B. Output: 4 weights normalized to sum to 1.

**Also:**
- **Bootstrap:** 1000 resamples of participants (with replacement) → mean + 95% CI per weight
- **Leave-one-plaza-out CV:** hold out all triplets involving one site, refit, predict held-out triplets; average accuracy over 18 sites; compare to chance (33.3%) via permutation test (1000 label shuffles, report percentile of real accuracy)
- **Area-only baseline:** same procedure with isovist_area alone (for H2)

---

## PHASE 6 — Results Dashboard

- 4 fitted weights as bar chart with bootstrap CIs
- Leave-one-out accuracy vs. chance vs. area-only baseline
- H1/H2/H3 support statement (e.g. "H1 supported: accuracy 61% vs chance 33%, p<0.001")
- Re-clustering of the 18 sites with the weighted distance (k-means, k=4), scatter plot on 2 selectable metric axes, cluster-colored
- Site map with cluster color-coding
