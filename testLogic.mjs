import { readFile } from "node:fs/promises";
import { decideEntry, meltIt } from "./decisionEngine.js";

const testCases = JSON.parse(await readFile("./mindmelt_logic_test_cases.json", "utf8"));

const now = new Date();
const ctx = {
  userId: "logic-test-user",
  now,
  timezone: "America/New_York",
  preferences: {
    autoCommitThreshold: 0.82,
    reviewThreshold: 0.62,
    defaultCalendar: "PERSONAL",
    lowStimulationMode: false,
    showCountsOnly: true,
    defaultReminderMinutesBefore: [1440, 120, 15],
  },
  calendars: [],
  tasks: [
    { id: "task_1", title: "Clean desk", status: "OPEN", energy: "LOW", durationMinutes: 5 },
  ],
  recommendations: [
    { id: "rec_1", title: "Dune: Part Two", kind: "MOVIE", status: "SAVED" },
  ],
  notes: [],
  ideas: [],
};

let failures = 0;

for (const testCase of testCases) {
  const isMulti = testCase.expectedIntent === "MULTI";
  const result = isMulti ? meltIt(testCase.input, ctx) : decideEntry(testCase.input, ctx);

  if (isMulti) {
    const categories = result.map((item) => item.classification.primaryCategory).join(", ");
    console.log(`✓ ${testCase.input}`);
    console.log(`  → ${result.length} chunks: ${categories}`);
    continue;
  }

  const intent = result.classification.intent;
  const category = result.classification.primaryCategory;
  const okIntent = intent === testCase.expectedIntent;
  const expectedCategoryText = testCase.expectedCategory;
  const okCategory = expectedCategoryText.includes(category);

  if (!okIntent || !okCategory) {
    failures += 1;
    console.log(`✗ ${testCase.input}`);
    console.log(`  expected: ${testCase.expectedIntent} / ${testCase.expectedCategory}`);
    console.log(`  got:      ${intent} / ${category}`);
  } else {
    console.log(`✓ ${testCase.input}`);
    console.log(`  → ${intent} / ${category} / ${Math.round(result.classification.confidence * 100)}%`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} logic test${failures === 1 ? "" : "s"} failed.`);
  process.exit(1);
}

console.log("\nAll MindMelt logic smoke tests passed.");
