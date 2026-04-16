#!/usr/bin/env python3
"""
Generate tagged Obsidian myth notes from CSV + bedtime story JSONs.

Each note gets YAML frontmatter with visualization tags that the JARVIS
Story Stage Manager can use to pre-index which modules to fire:
- map_locations: for globe rotation waypoints
- characters: for family tree module
- effects: for particle effect module
- chart_data: for chart module (popularity, themes)
- timeline_events: for timeline module
- image_queries: for semantic image search
- mood/atmosphere: for blob visual state

Usage:
    python3 generate-myth-notes.py
"""

import csv
import json
import os
import re
from pathlib import Path
from glob import glob

# Paths
CSV_PATH = os.path.expanduser("~/obsidian-vault/MYTHS/sacred-circuits-master.csv")
STORIES_DIR = "/Volumes/Extreme Pro/MYTHS/99-APPENDIX/bedtime-stories-backup"
OUTPUT_DIR = os.path.expanduser("~/obsidian-vault/MYTHS/notes")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Location coordinates for map module (subset — the map-panel.js has 495+)
# We just tag the location names; the frontend resolves coords
KNOWN_LOCATIONS = {
    "athens", "crete", "delphi", "olympus", "mount olympus", "troy", "ithaca",
    "corinth", "sparta", "thebes", "argos", "mycenae", "colchis", "naxos",
    "thessaly", "arcadia", "thrace", "lycia", "phrygia", "lydia", "egypt",
    "ethiopia", "libya", "sicily", "cyprus", "rhodes", "lemnos", "delos",
    "samothrace", "eleusis", "tartarus", "underworld", "aegean sea",
    "mediterranean", "caucasus", "india", "syria", "phoenicia", "tyre",
    "sidon", "marathon", "thermopylae", "salamis", "pylos", "tiryns",
    "epidaurus", "nemea", "lerna", "stymphalus", "erymanthus",
}

# Effect type mapping from mood/themes
MOOD_TO_EFFECTS = {
    "tragic": ["divine", "stars"],
    "dark": ["fire", "lightning"],
    "triumphant": ["divine", "stars"],
    "epic": ["lightning", "fire"],
    "romantic": ["stars", "ocean"],
    "mysterious": ["stars", "divine"],
    "violent": ["fire", "lightning"],
    "peaceful": ["ocean", "stars"],
    "comedic": ["stars"],
    "melancholic": ["ocean", "divine"],
    "ominous": ["lightning", "fire"],
    "heroic": ["fire", "divine"],
}

ELEMENT_TO_EFFECTS = {
    "water": "ocean",
    "fire": "fire",
    "earth": "transformation",
    "air": "divine",
    "lightning": "lightning",
    "thunder": "lightning",
}


def load_bedtime_stories():
    """Load all bedtime story JSONs into a dict keyed by graves_number."""
    stories = {}
    if not os.path.exists(STORIES_DIR):
        print(f"WARNING: Stories dir not found: {STORIES_DIR}")
        return stories

    for path in glob(os.path.join(STORIES_DIR, "*.json")):
        try:
            with open(path) as f:
                data = json.load(f)
            gn = str(data.get("graves_number", ""))
            if gn:
                stories[gn] = data
        except Exception as e:
            print(f"  Error reading {path}: {e}")

    print(f"Loaded {len(stories)} bedtime stories")
    return stories


def extract_locations(location_str):
    """Extract individual locations from semicolon-separated string."""
    if not location_str:
        return []
    locs = [l.strip().lower() for l in location_str.split(";")]
    # Filter to known map locations
    map_locs = []
    for loc in locs:
        for known in KNOWN_LOCATIONS:
            if known in loc:
                map_locs.append(loc.title())
                break
    return map_locs if map_locs else [l.title() for l in locs[:5]]  # Fallback: first 5


def extract_characters(row):
    """Extract character list for family tree module."""
    chars = set()
    if row.get("primary_deity"):
        chars.add(row["primary_deity"])
    if row.get("entity"):
        chars.add(row["entity"])
    if row.get("other_characters"):
        for c in row["other_characters"].split(";"):
            c = c.strip()
            if c:
                chars.add(c)
    return sorted(chars)[:15]  # Cap at 15 most relevant


def determine_effects(row):
    """Determine which particle effects to show based on mood, themes, elements."""
    effects = set()
    mood = (row.get("mood") or "").lower().strip()
    if mood in MOOD_TO_EFFECTS:
        effects.update(MOOD_TO_EFFECTS[mood])

    elements = (row.get("elements") or "").lower()
    for elem, effect in ELEMENT_TO_EFFECTS.items():
        if elem in elements:
            effects.add(effect)

    violence = (row.get("violence_level") or "").lower()
    if violence in ("high", "extreme"):
        effects.add("fire")
        effects.add("lightning")

    return sorted(effects) if effects else ["divine"]


def build_image_queries(row, story_data=None):
    """Build semantic search queries for the image matcher."""
    queries = []
    title = row.get("title", "")
    deity = row.get("primary_deity", row.get("entity", ""))

    # Main scene query
    if title:
        queries.append(f"{title} Greek mythology")
    if deity:
        queries.append(f"{deity} Greek god mythology")

    # Key elements as queries
    symbols = row.get("symbols", "")
    if symbols:
        syms = [s.strip() for s in symbols.split(";")][:3]
        for s in syms:
            queries.append(f"{s} ancient Greek art")

    # Scene from synopsis
    synopsis = row.get("title_synopsis", "")
    if synopsis and len(synopsis) > 20:
        queries.append(synopsis[:150])

    return queries[:5]


def build_timeline_events(row, story_data=None):
    """Extract timeline events from McKee structure if available."""
    events = []
    if story_data and "metadata" in story_data:
        mckee = story_data["metadata"].get("mckee_structure", {})
        if isinstance(mckee, dict):
            if mckee.get("inciting_incident"):
                events.append({"label": "Inciting Incident", "description": mckee["inciting_incident"][:100]})
            if mckee.get("complication"):
                events.append({"label": "Complication", "description": mckee["complication"][:100]})
            if mckee.get("crisis"):
                events.append({"label": "Crisis", "description": mckee["crisis"][:100]})
            if mckee.get("climax"):
                events.append({"label": "Climax", "description": mckee["climax"][:100]})
    return events


def slugify(text):
    """Convert text to filename-safe slug."""
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    return text[:80]


def generate_note(row, story_data=None):
    """Generate a single Obsidian markdown note with visualization frontmatter."""
    title = row.get("title", "Unknown Myth")
    graves_num = row.get("graves_number", "")
    deity = row.get("primary_deity", row.get("entity", "Unknown"))
    locations = extract_locations(row.get("locations", row.get("location", "")))
    characters = extract_characters(row)
    effects = determine_effects(row)
    image_queries = build_image_queries(row, story_data)
    timeline_events = build_timeline_events(row, story_data)

    # Tags for Obsidian
    raw_tags = row.get("tags", "")
    tags = [t.strip().lower().replace(" ", "-") for t in raw_tags.split(";") if t.strip()][:10]
    tags = list(set(["myth", "greek-mythology", deity.lower().replace(" ", "-")] + tags))

    # Mood and atmosphere for blob state
    mood = row.get("mood", "mysterious")
    violence = row.get("violence_level", "unknown")

    # Popularity
    pop_tier = row.get("popularity_tier", "unknown")
    pop_score = row.get("popularity_score", "0")

    # Sacred Circuits data
    circuit_title = ""
    tech_resonance = ""
    closing_parallel = ""
    if story_data and "sacred_circuits" in story_data:
        sc = story_data["sacred_circuits"]
        circuit_title = sc.get("circuit_title", "")
        tech_resonance = sc.get("tech_resonance", "")
        closing_parallel = sc.get("closing_parallel", "")

    # Build the note
    note = f"""---
title: "{title}"
graves_number: {graves_num}
primary_deity: "{deity}"
type: myth
status: tagged
popularity_tier: {pop_tier}
popularity_score: {pop_score}
mood: {mood}
violence_level: {violence}
tags: [{', '.join(tags)}]

# === JARVIS Visualization Tags ===
# Story Stage Manager reads these to pre-index modules
jarvis:
  map_locations: [{', '.join(f'"{l}"' for l in locations)}]
  characters: [{', '.join(f'"{c}"' for c in characters)}]
  effects: [{', '.join(f'"{e}"' for e in effects)}]
  image_queries:
{chr(10).join(f'    - "{q}"' for q in image_queries)}
  timeline_events: {len(timeline_events)}
  blob_mood: "{mood}"
  blob_intensity: "{'high' if violence in ('high', 'extreme') else 'medium' if violence == 'moderate' else 'low'}"
---

# {title}

**Deity:** {deity} | **Graves #:** {graves_num} | **Popularity:** {pop_tier} ({pop_score}/10)
**Mood:** {mood} | **Violence:** {violence}

## Synopsis
{row.get('title_synopsis', row.get('summary', 'No synopsis available.'))}

## Locations
{', '.join(locations) if locations else 'No specific locations identified.'}

## Characters
{', '.join(characters) if characters else 'No characters listed.'}

## Symbols & Key Objects
{row.get('symbols', 'None listed.')}

## Themes
{row.get('themes', 'None listed.')}

## Related Myths
Graves numbers: {row.get('related_graves_myths', 'None')}
"""

    # Add Sacred Circuits section if available
    if circuit_title:
        note += f"""
## Sacred Circuits
**Circuit:** {circuit_title}
**Tech Resonance:** {tech_resonance}
**Closing Parallel:** {closing_parallel}
"""

    # Add McKee structure if available
    if story_data and "metadata" in story_data:
        mckee = story_data["metadata"].get("mckee_structure", {})
        if isinstance(mckee, dict) and mckee.get("inciting_incident"):
            note += f"""
## McKee Story Structure
- **Inciting Incident:** {mckee.get('inciting_incident', '')}
- **Complication:** {mckee.get('complication', '')}
- **Crisis:** {mckee.get('crisis', '')}
- **Climax:** {mckee.get('climax', '')}
- **Value Arc:** {mckee.get('value_arc', '')}
"""

    # Add bedtime story if available
    if story_data and story_data.get("bedtime_story"):
        word_count = story_data.get("metadata", {}).get("word_count", "?")
        duration = story_data.get("metadata", {}).get("duration_estimate", "?")
        note += f"""
## Bedtime Story ({word_count} words, {duration})

{story_data['bedtime_story']}
"""

    # Moral
    moral = row.get("moral", "")
    if moral:
        note += f"""
## Moral
> {moral}
"""

    return note


def main():
    print("Loading bedtime stories...")
    stories = load_bedtime_stories()

    print(f"Reading CSV: {CSV_PATH}")
    with open(CSV_PATH, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    print(f"Found {len(rows)} myths in CSV")

    created = 0
    with_stories = 0
    for row in rows:
        title = row.get("title", "")
        graves_num = row.get("graves_number", "")
        if not title:
            continue

        # Find matching bedtime story
        story_data = stories.get(graves_num)
        if story_data:
            with_stories += 1

        # Generate note
        note_content = generate_note(row, story_data)

        # Write file
        slug = slugify(title)
        if graves_num:
            filename = f"myth-{graves_num.zfill(3)}-{slug}.md"
        else:
            filename = f"myth-{slug}.md"

        filepath = os.path.join(OUTPUT_DIR, filename)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(note_content)
        created += 1

    print(f"\n✅ Generated {created} Obsidian myth notes")
    print(f"   {with_stories} with bedtime stories")
    print(f"   {created - with_stories} without bedtime stories")
    print(f"   Output: {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
