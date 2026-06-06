# MindMelt Dashboard Prototype v0

A flat, dependency-free starter package for the **MindMelt** ADHD-friendly organization app.

MindMelt is built around one product rule:

> **Capture first. Classify second. Ask only when needed.**

The dashboard uses a single universal entry bar, one large Focus Area, and a small icon dock for Calendar, Tasks, Ideas, Recommendations, Notes, and Brain Dump.

---

## What is included

```text
index.html                  Main dashboard markup
styles.css                  Dark app UI styling
app.js                      Dashboard behavior and local demo storage
decisionEngine.js           Browser-ready compiled decision engine
decisionEngine.ts           Original TypeScript decision engine source
mindmelt_logic_test_cases.json
manifest.webmanifest        PWA metadata
server.mjs                  Tiny no-dependency local dev server
testLogic.mjs               Logic smoke test runner
assets/
  mindmelt-app-icon.png
  mindmelt-logo-mark.png
  mindmelt-logo-lockup.png
  mindmelt-mark.svg
```

---

## Run locally

Requires Node.js.

```bash
npm start
```

Then open:

```text
http://localhost:5173
```

No npm install is required because there are no dependencies.

---

## Test the logic

```bash
npm run test:logic
```

This runs the sample entry cases against the Decision Engine.

---

## Upload to GitHub

1. Create a new GitHub repository.
2. Upload all files from this folder into the repository root.
3. Commit the files.
4. For a static preview, enable GitHub Pages and point it to the root branch.

Because this is a flat static app, `index.html` can be served directly by GitHub Pages.

---

## Try these entries

```text
Need to buy cat food tomorrow
Doctor appointment Friday at 3pm
Check out Dune Part Two
Business idea: app that sorts brain dumps
Do I have plans tonight at 5?
I'm bored
I can't start cleaning the garage
Melt it: call Dan, buy cat food, schedule dentist, watch Metallica documentary
```

---

## Product logic

The dashboard sends every entry through:

```text
raw input
  → save inbox item
  → detect intent
  → extract date/time/entities
  → score categories
  → choose confidence band
  → create action
  → compose Focus Area widget
```

The major categories are intentionally simple for the MVP:

```text
Calendar
Tasks
Ideas
Recommendations
Notes
Brain Dump
```

The Decision Engine returns a result shaped like:

```ts
{
  inbox,
  classification,
  actions,
  widget
}
```

The UI does not need to understand the full logic. It renders the returned widget and applies the returned actions.

---

## Next build step

The next useful milestone is converting this prototype into a real app shell with persistent account storage, calendar integrations, notification scheduling, and an optional AI classifier hook when rules are uncertain.
