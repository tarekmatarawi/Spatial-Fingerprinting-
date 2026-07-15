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

The frontend carries a "drafting instrument" visual identity, established via `/impeccable init` — see [PRODUCT.md](../PRODUCT.md) for the full brief. White paper surfaces, deep indigo as the brand/technical-pen color, redline red reserved for markup (viewpoint marker, warnings, wall hits), IBM Plex Sans/Mono typography. Every subsequent phase's UI (survey, results dashboard) should extend this system rather than introduce new visual language — keep the researcher's dense working surfaces and the single-task participant survey feeling like the same family at different densities.

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

**Validation before Phase 3:** load a real site; confirm buildings appear at correct relative heights and positions; confirm clicking places a marker at the correct location (not offset or inverted).

---

## PHASE 3 — Isovist Ray-Casting Engine (THE CRITICAL PHASE)

The most important and error-prone phase. Follow exactly — do not approximate the geometry logic.

### Method: radial ray-casting ("radiate" method, per Benedikt 1979)

**Inputs:**
- Viewpoint `(x0, y0)` — the clicked point; planar 2D isovist to start (see note below)
- Field of view of **120°**, centered on a viewing direction (second click sets "facing direction," or default = facing the plaza's open centroid)
- The site's building footprint polygons (obstacles)
- Max ray length `max_vista` (e.g. 200 m) beyond which a ray is "occluded"/unbounded

**Algorithm:**
1. Cast N rays (start N=120, one per degree) evenly spaced across the 120° FOV from `(x0, y0)`.
2. Test each ray against every building footprint edge (line segment).
3. Record the **nearest intersection** per ray. No intersection within `max_vista` → terminate at `max_vista`, flag `occluded = true`. Hit a wall → terminate there, flag `occluded = false` (an "intersection" vertex; occlusion = ran out of range, intersection = hit a wall).
4. The ordered ray endpoints (sorted by angle) are the isovist polygon vertices.

**Metric formulas (exactly these — Benedikt 1979 / "Visual Typology" paper):**

Given isovist polygon vertices `(xᵢ, yᵢ)` relative to the viewpoint:

- **Area** (shoelace): `Area = Σ (1/2) |x[i-1]·y[i] − x[i]·y[i-1]|`
- **Perimeter**: `Σ sqrt((x[i]−x[i-1])² + (y[i]−y[i-1])²)`
- **Closed Perimeter**: same sum, but only over consecutive vertex pairs where BOTH endpoints are intersection-type (hit a building)
- **Compactness** (isoperimetric quotient): `(4π × Area) / Perimeter²`
- **Occlusivity**: `1 − (ClosedPerimeter / Perimeter)`

> ⚠️ **OPEN QUESTION (must resolve before implementing):** the existing Grasshopper dataset has Occlusivity values in the hundreds (e.g. 354.10, 598.13), which cannot be Benedikt's 0–1 ratio — likely an absolute closed-edge length in meters. Resolve the definition/units so web-computed values are comparable with the existing 18-site dataset. Working plan: compute and store BOTH the raw lengths and the ratio.

### Enclosure Ratio (SEPARATE from the isovist — not derived from the isovist polygon)

**Method: 8-ray horizontal H/W cast**
1. From `(x0, y0)`, cast 8 horizontal rays at 45° intervals (0°–315°, full 360°).
2. Per ray: nearest building intersection → horizontal distance `d` and building height `h` at that point.
3. Per ray compute `h / d`. Rays with no hit within `max_vista`: exclude from the average OR treat as 0 — decide and stay consistent (decision pending).
4. Enclosure Ratio = average of `h/d` (specify whether over all 8 rays or only hitting rays).

**Validation gate before Phase 4:** test on 2–3 sites with existing Grasshopper-computed values. Web output must be same order of magnitude and preserve relative ranking (e.g. if Naschmarkt > Königsplatz on enclosure in Rhino, same must hold here). Wildly different results = ray-casting bug; do not proceed until resolved.

**Implementation note:** start with a **planar (2D) isovist** — matches what Decoding Spaces computes and is far simpler to get correct. True 3D isovist only after 2D is fully validated.

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
