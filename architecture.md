# SkillProbe AI — Architecture & Scoring/Logic Description

---

## System Architecture

### State Machine

```
IDLE → LOADING_CONTEXT → ASSESSING → GENERATING_PLAN → DASHBOARD
```

---

### Phase 1 — Context Extraction

| Input | Method |
|---|---|
| Job Description | Plain text pasted by user |
| Resume | PDF → FileReader → base64 → `inline_data` block |

- Both inputs are sent together in a **single API call**
- The AI model returns structured JSON:

```json
{
  "requiredSkills": ["React", "Python", "SQL", "..."],
  "candidateName": "Dheeraj Baidya",
  "candidateBackground": "Summary of candidate's existing experience..."
}
```

---

### Phase 2 — MCQ Assessment Loop

**Step 1 — Question Generation**
For each skill in `requiredSkills[]`, the AI model returns a strictly formatted JSON block:

```json
{
  "skill": "React",
  "question": "What does useEffect with an empty dependency array do?",
  "options": {
    "A": "Runs on every render",
    "B": "Runs only once after the first render",
    "C": "Runs before the component mounts",
    "D": "Runs only when props change"
  },
  "correct": "B"
}
```

**Step 2 — User Answer Selection**
- Four clickable buttons (A / B / C / D) replace the text input
- On selection:
  - ✅ **Green flash** — correct answer picked
  - ❌ **Red flash** — wrong answer picked, correct option revealed
  - AI model returns a brief 1-line explanation, then moves to the next skill

**Step 3 — Score Tracking**
- Scoring is **deterministic and client-side** (no extra API call per answer)
- `selectedKey === currentMCQ.correct` → score assigned per skill
- Loop repeats until all skills are assessed
- AI model signals completion with: `"ASSESSMENT_COMPLETE"`

**Progress indicator:**
```
Question 3 of 7  [skill name currently being assessed]
```

---

### Phase 3 — Learning Plan Generation

Triggered by `"ASSESSMENT_COMPLETE"` signal. A final API call is made with:
- Full conversation history
- `skillScores` map (keyed by skill name)

The AI model returns raw JSON learning plan (no markdown, no backticks):

```json
{
  "candidateName": "Dheeraj Baidya",
  "targetRole": "Full Stack Developer",
  "overallScore": 62,
  "skills": [
    {
      "name": "React",
      "score": 7,
      "level": "Intermediate",
      "gap": "Lacks knowledge of advanced patterns like compound components",
      "resources": [
        {
          "title": "React Patterns Deep Dive",
          "url": "https://...",
          "type": "article",
          "duration": "2 hours"
        }
      ],
      "weeklyPlan": [
        { "week": 1, "task": "Complete React advanced patterns module", "hours": 5 }
      ]
    }
  ],
  "totalEstimatedTime": "6 weeks",
  "priorityOrder": ["Python", "SQL", "React"]
}
```

Client strips accidental code fences before parsing:
```javascript
text.replace(/```json|```/g, '').trim()
```

---

### Dashboard Rendering

| Component | Source |
|---|---|
| Circular readiness score ring | `overallScore` (avg of all skill scores) |
| Skill cards + score bars | `skills[]` array |
| Score bar color | `> 7` → 🟢 Green, `4–7` → 🟡 Yellow, `< 4` → 🔴 Red |
| Resource links | `skills[].resources[]` with type icons |
| Weekly roadmap timeline | `skills[].weeklyPlan[]` grouped by week number |
| Export button | Downloads full plan as `.json` |

---

## Scoring & Logic Description

### Skill Extraction (Phase 1)
When the user submits the JD and PDF, a single API call is made with both inputs — the JD as plain text and the resume as a base64 `inline_data` document block. The AI model returns a JSON object containing `requiredSkills[]` (parsed from the JD), `candidateName`, and a `background` summary of what the candidate already knows.

### MCQ Generation (Phase 2)
For each skill in `requiredSkills[]`, the AI model is prompted to return a strictly formatted JSON block containing the skill name, a question string, four labelled options (A–D), and the correct answer key. The full conversation history is passed on every API call to maintain multi-turn context. The client parses the response with a regex match on the JSON block and sets `currentMCQ` state, which swaps the text input for four clickable option buttons.

### Scoring Logic
Scoring is deterministic and client-side — no second API call needed per answer. When the user picks an option, the app compares `selectedKey === currentMCQ.correct`:

- **Correct answer** → skill score set to **10**
- **Wrong answer** → skill score set to **3**

This gives a binary per-skill score (strong vs needs work) stored in a `skillScores` map keyed by skill name. The **overall readiness score** displayed on the dashboard is the average across all skills, expressed as a percentage.

### Plan Generation (Phase 3)
Once the AI model replies with `"ASSESSMENT_COMPLETE"`, the app fires a final API call passing the entire chat history plus the `skillScores` map. The model is instructed to return only raw JSON (no markdown) containing each skill's gap description, 2–3 curated learning resources with URLs, estimated durations, and a week-by-week task plan.

### Dashboard Rendering
The parsed plan JSON drives the UI directly — skill cards are rendered from `skills[]`, the score bar color is picked by threshold (`score > 7` → green, `4–7` → yellow, `< 4` → red), and the roadmap timeline groups `weeklyPlan` entries across all skills by week number.

---

*SkillProbe AI — AI-Powered Skill Assessment & Personalised Learning Plan Agent*
