/**
 * MindMelt Decision Engine v0
 * ---------------------------------------
 * Goal: make the universal entry bar feel like a trusted external brain.
 *
 * Core ADHD-informed rule:
 *   Save first. Decide second. Ask the user only when confidence is low.
 *
 * This file is intentionally dependency-free so a developer can drop it into
 * a React Native / Expo / Next.js project and replace the placeholder storage,
 * date parsing, and optional LLM classifier hooks later.
 */
// ---------------------------
// Public API
// ---------------------------
export function decideEntry(rawText, ctx) {
    const inbox = createInboxItem(rawText);
    const classification = classifyEntry(rawText, ctx);
    const actions = buildActions(inbox, classification, ctx);
    const widget = composeFocusWidget(classification, actions, ctx);
    return { inbox, classification, actions, widget };
}
/**
 * Melt It: split a messy brain dump into separate decisions.
 * Example: "I need to call Dan, buy cat food, schedule dentist, watch Dune"
 */
export function meltIt(rawText, ctx) {
    const chunks = splitBrainDump(rawText);
    return chunks.map((chunk) => decideEntry(chunk, ctx));
}
// ---------------------------
// Classification
// ---------------------------
export function classifyEntry(rawText, ctx) {
    const text = normalize(rawText);
    const temporal = parseTemporalSignal(text, ctx.now);
    const safety = detectSafety(text);
    const intent = determineIntent(text, temporal, safety);
    const extracted = extractEntities(text);
    const title = cleanTitle(rawText);
    const scores = scoreCategories(text, temporal, extracted);
    const winner = scores[0] ?? { category: "BRAIN_DUMP", score: 0, reasons: ["No clear category"] };
    const confidence = clamp(winner.score, 0, 1);
    const confidenceBand = toConfidenceBand(confidence, ctx);
    const classification = {
        intent,
        primaryCategory: intent === "ASK" || intent === "ASSIST" || intent === "SAFETY" ? "BRAIN_DUMP" : winner.category,
        categoryScores: scores,
        confidence,
        confidenceBand,
        temporal,
        title,
        extracted,
        safety,
    };
    // Low-confidence capture should ask one tap, not make the user type again.
    if (intent === "CAPTURE" && confidenceBand === "ASK_ONE_TAP") {
        classification.needsClarification = {
            question: "Where should I put this?",
            options: ["Task", "Calendar", "Note", "Idea", "Recommendation", "Brain Dump"],
        };
    }
    // Date without time often needs a softer review for calendar events.
    if (classification.primaryCategory === "CALENDAR" && temporal.hasDate && !temporal.hasTime) {
        classification.confidenceBand = "REVIEW";
        classification.needsClarification = {
            question: "What time should I put this on your calendar?",
            options: ["Morning", "Afternoon", "Evening", "All day", "Ask me later"],
        };
    }
    return classification;
}
function determineIntent(text, temporal, safety) {
    if (safety?.level === "CRISIS")
        return "SAFETY";
    if (matchesAny(text, SAFETY_SUPPORT_PATTERNS))
        return "ASSIST";
    if (matchesAny(text, BOREDOM_PATTERNS))
        return "ASSIST";
    if (matchesAny(text, CANT_START_PATTERNS))
        return "ASSIST";
    if (matchesAny(text, QUESTION_PATTERNS) || text.endsWith("?"))
        return "ASK";
    if (matchesAny(text, PLAN_PATTERNS))
        return "PLAN";
    if (matchesAny(text, COMMAND_PATTERNS))
        return "COMMAND";
    return "CAPTURE";
}
function scoreCategories(text, temporal, extracted) {
    const scores = {
        CALENDAR: { category: "CALENDAR", score: 0, reasons: [] },
        TASK: { category: "TASK", score: 0, reasons: [] },
        IDEA: { category: "IDEA", score: 0, reasons: [] },
        RECOMMENDATION: { category: "RECOMMENDATION", score: 0, reasons: [] },
        NOTE: { category: "NOTE", score: 0, reasons: [] },
        BRAIN_DUMP: { category: "BRAIN_DUMP", score: 0.15, reasons: ["Fallback external brain capture"] },
    };
    const add = (cat, amount, reason) => {
        scores[cat].score += amount;
        scores[cat].reasons.push(reason);
    };
    if (temporal.hasDate || temporal.hasTime) {
        add("CALENDAR", 0.35, "Date/time detected");
        add("TASK", 0.18, "Date/time may be a deadline or reminder");
    }
    if (matchesAny(text, EVENT_PATTERNS))
        add("CALENDAR", 0.4, "Event phrase detected");
    if (matchesAny(text, TASK_PATTERNS))
        add("TASK", 0.45, "Action/task phrase detected");
    if (matchesAny(text, IDEA_PATTERNS))
        add("IDEA", 0.55, "Idea language detected");
    if (matchesAny(text, RECOMMENDATION_PATTERNS))
        add("RECOMMENDATION", 0.58, "Recommendation/save-for-later phrase detected");
    if (matchesAny(text, NOTE_PATTERNS))
        add("NOTE", 0.42, "Remember/note phrase detected");
    if (extracted.recommendationKind) {
        add("RECOMMENDATION", 0.28, `${extracted.recommendationKind.toLowerCase()} detected`);
    }
    // A very short noun phrase like "cat food" is likely a task in a capture app.
    if (wordCount(text) <= 4 && !temporal.hasDate && !matchesAny(text, IDEA_PATTERNS) && !extracted.recommendationKind) {
        add("TASK", 0.2, "Short capture likely represents a to-do");
    }
    // Time with a social object often means calendar.
    if (temporal.hasTime && (matchesAny(text, SOCIAL_EVENT_PATTERNS) || extracted.people.length > 0)) {
        add("CALENDAR", 0.25, "Time plus person/social context detected");
    }
    // Clamp and sort.
    return Object.values(scores)
        .map((s) => ({ ...s, score: clamp(s.score, 0, 1) }))
        .sort((a, b) => b.score - a.score);
}
// ---------------------------
// Actions
// ---------------------------
function buildActions(inbox, c, ctx) {
    const actions = [{ type: "SAVE_INBOX", inbox }];
    if (c.intent === "SAFETY" && c.safety?.level === "CRISIS") {
        actions.push({ type: "SHOW_SAFETY_SUPPORT", level: "CRISIS", reason: c.safety.reason ?? "Crisis language detected" });
        return actions;
    }
    if (c.intent === "ASK") {
        actions.push({ type: "SEARCH_MEMORY", query: buildSearchQuery(c, ctx) });
        return actions;
    }
    if (c.intent === "ASSIST") {
        actions.push({ type: "SHOW_ASSIST", mode: determineAssistMode(normalize(inbox.rawText)) });
        return actions;
    }
    if (c.needsClarification && c.confidenceBand === "ASK_ONE_TAP") {
        actions.push({
            type: "ASK_CLARIFYING_QUESTION",
            question: c.needsClarification.question,
            options: c.needsClarification.options,
        });
        actions.push({ type: "MARK_REVIEW", reason: "Low classification confidence" });
        return actions;
    }
    if (c.confidenceBand === "ASK_ONE_TAP") {
        actions.push({ type: "MARK_REVIEW", reason: "Low confidence fallback" });
        return actions;
    }
    switch (c.primaryCategory) {
        case "CALENDAR":
            actions.push({
                type: "CREATE_EVENT",
                event: {
                    title: c.title,
                    start: c.temporal.resolvedStart ?? ctx.now.toISOString(),
                    end: c.temporal.resolvedEnd,
                    calendarType: inferCalendarType(inbox.rawText, ctx),
                    sourceInboxId: inbox.id,
                    people: c.extracted.people,
                    location: c.extracted.locations[0],
                },
            });
            break;
        case "TASK":
            actions.push({
                type: "CREATE_TASK",
                task: {
                    title: c.title,
                    due: c.temporal.resolvedStart,
                    status: "OPEN",
                    energy: inferEnergy(inbox.rawText),
                    durationMinutes: c.extracted.possibleDurationMinutes,
                    sourceInboxId: inbox.id,
                    nextStep: inferNextStep(inbox.rawText),
                },
            });
            break;
        case "RECOMMENDATION":
            actions.push({
                type: "CREATE_RECOMMENDATION",
                recommendation: {
                    title: c.title,
                    kind: c.extracted.recommendationKind ?? "OTHER",
                    sourceInboxId: inbox.id,
                    status: "SAVED",
                },
            });
            break;
        case "IDEA":
            actions.push({
                type: "CREATE_IDEA",
                idea: {
                    title: c.title,
                    body: inbox.rawText,
                    sourceInboxId: inbox.id,
                },
            });
            break;
        case "NOTE":
            actions.push({
                type: "CREATE_NOTE",
                note: {
                    title: c.title,
                    body: inbox.rawText,
                    sourceInboxId: inbox.id,
                },
            });
            break;
        case "BRAIN_DUMP":
            actions.push({ type: "MARK_REVIEW", reason: "Captured safely; no confident category" });
            break;
    }
    return actions;
}
function buildSearchQuery(c, ctx) {
    const text = normalize(c.title);
    const scope = ["ALL"];
    const lower = text.toLowerCase();
    if (lower.includes("plan") || lower.includes("calendar") || lower.includes("free") || lower.includes("busy")) {
        scope.splice(0, scope.length, "CALENDAR");
    }
    if (lower.includes("todo") || lower.includes("task") || lower.includes("need to")) {
        scope.splice(0, scope.length, "TASK");
    }
    if (lower.includes("recommend") || lower.includes("movie") || lower.includes("restaurant") || lower.includes("song")) {
        scope.splice(0, scope.length, "RECOMMENDATION");
    }
    const timeWindow = inferQuestionTimeWindow(lower, ctx.now);
    return { scope, text, timeWindow };
}
// ---------------------------
// Focus Widgets
// ---------------------------
function composeFocusWidget(c, actions, ctx) {
    const safetyAction = actions.find((a) => a.type === "SHOW_SAFETY_SUPPORT");
    if (safetyAction) {
        return {
            kind: "SAFETY",
            icon: "🛟",
            title: "You matter. Get support now.",
            subtitle: "MindMelt can pause organization and help you contact support.",
            chips: ["Call emergency services", "Contact trusted person", "Open crisis resources"],
            tone: "URGENT",
        };
    }
    const clarify = actions.find((a) => a.type === "ASK_CLARIFYING_QUESTION");
    if (clarify) {
        return {
            kind: "CLARIFY",
            icon: "✨",
            title: clarify.question,
            chips: clarify.options,
            subtitle: "One tap. No retyping.",
            tone: "CALM",
        };
    }
    const assist = actions.find((a) => a.type === "SHOW_ASSIST");
    if (assist)
        return composeAssistWidget(assist.mode, ctx);
    const search = actions.find((a) => a.type === "SEARCH_MEMORY");
    if (search) {
        return {
            kind: "SEARCH_RESULTS",
            icon: "🔎",
            title: "I’ll check your brain.",
            subtitle: describeSearch(search.query),
            tone: "CALM",
        };
    }
    const created = actions.find((a) => ["CREATE_TASK", "CREATE_EVENT", "CREATE_RECOMMENDATION", "CREATE_NOTE", "CREATE_IDEA"].includes(a.type));
    if (created) {
        return {
            kind: "CREATED",
            icon: iconForCategory(c.primaryCategory),
            title: `${labelForCategory(c.primaryCategory)} saved`,
            subtitle: c.title,
            chips: c.confidenceBand === "REVIEW" ? ["Looks right", "Edit", "Move"] : ["Undo", "Edit"],
            tone: "SUCCESS",
        };
    }
    return {
        kind: "REVIEW",
        icon: "🧠",
        title: "Captured to Brain Dump",
        subtitle: "I saved it so it does not disappear. You can sort it later.",
        chips: ["Sort now", "Later"],
        tone: "CALM",
    };
}
function composeAssistWidget(mode, ctx) {
    if (mode === "BORED_PRODUCTIVE" || mode === "BORED_FUN" || mode === "BORED_QUICK_DOPAMINE") {
        const lowEffortTasks = ctx.tasks.filter((t) => t.status === "OPEN" && (t.energy === "LOW" || (t.durationMinutes ?? 999) <= 15)).slice(0, 3);
        const fun = ctx.recommendations.filter((r) => r.status === "SAVED").slice(0, 3);
        return {
            kind: "BOREDOM",
            icon: "⚡",
            title: "Boredom Busters",
            subtitle: "Pick a lane. I’ll keep it small.",
            chips: ["Productive", "Fun", "Quick dopamine"],
            items: [
                ...lowEffortTasks.map((t) => ({ icon: "✅", title: t.title, subtitle: "Productive · low effort", actionLabel: "Start" })),
                ...fun.map((r) => ({ icon: "⭐", title: r.title, subtitle: `${r.kind.toLowerCase()} saved for later`, actionLabel: "Open" })),
            ].slice(0, 4),
            tone: "PLAYFUL",
        };
    }
    return {
        kind: "BOREDOM",
        icon: "🧩",
        title: "Let’s make it smaller.",
        subtitle: "You do not need the whole task. Just the first visible step.",
        chips: ["Give me 1 step", "2-minute start", "Body double timer"],
        tone: "CALM",
    };
}
// ---------------------------
// Helpers: parsing, extraction, scoring
// ---------------------------
function createInboxItem(rawText) {
    return {
        id: `inbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        rawText,
        createdAt: new Date().toISOString(),
        source: "TEXT",
        status: "CAPTURED",
    };
}
function normalize(input) {
    return input.trim().replace(/\s+/g, " ").toLowerCase();
}
function cleanTitle(input) {
    return input
        .trim()
        .replace(/^remind me to\s+/i, "")
        .replace(/^remember to\s+/i, "")
        .replace(/^i need to\s+/i, "")
        .replace(/^need to\s+/i, "")
        .replace(/^todo:?\s*/i, "")
        .replace(/^note:?\s*/i, "")
        .replace(/^idea:?\s*/i, "")
        .slice(0, 120);
}
function parseTemporalSignal(text, now) {
    const phrases = [];
    const hasExplicitClockTime = /\b(?:at\s*)?\d{1,2}:\d{2}\s*(am|pm)?\b/.test(text) ||
        /\b(?:at\s*)?\d{1,2}\s*(am|pm)\b/.test(text) ||
        /\bat\s+\d{1,2}\b/.test(text);
    const hasTimeWord = /\b(noon|midnight|tonight|morning|afternoon|evening)\b/.test(text);
    const hasTime = hasExplicitClockTime || hasTimeWord;
    const hasRelativeDate = /\b(today|tomorrow|tonight|this weekend|weekend|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(text);
    const hasNumericDate = /\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/.test(text);
    const hasMonthDate = monthDateRegex().test(text);
    const hasDate = hasRelativeDate || hasNumericDate || hasMonthDate;
    const matched = [
        ...Array.from(text.matchAll(/today|tomorrow|tonight|this weekend|weekend|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?/g)).map((m) => m[0]),
        ...Array.from(text.matchAll(monthDateRegex(true))).map((m) => m[0]),
    ];
    if (matched.length)
        phrases.push(...matched);
    let resolvedStart;
    if (hasDate || hasTime) {
        resolvedStart = roughResolveDate(text, now).toISOString();
    }
    return {
        hasDate,
        hasTime,
        isAllDay: hasDate && !hasTime,
        phrases,
        resolvedStart,
        ambiguity: hasDate && !hasTime ? "MISSING_TIME" : hasTime && !hasDate ? "MISSING_DATE" : hasRelativeDate ? "RELATIVE" : "NONE",
    };
}
function roughResolveDate(text, now) {
    const d = new Date(now);
    const monthDate = text.match(monthDateRegex());
    if (monthDate) {
        const monthIndex = monthIndexFromName(monthDate[1]);
        const day = parseInt(monthDate[2], 10);
        const explicitYear = monthDate[3] ? parseInt(monthDate[3], 10) : undefined;
        d.setFullYear(explicitYear ?? d.getFullYear(), monthIndex, day);
        if (!explicitYear && d.getTime() < now.getTime())
            d.setFullYear(d.getFullYear() + 1);
        setTime(d, 9, 0);
    }
    const numericDate = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
    if (numericDate && !monthDate) {
        const month = parseInt(numericDate[1], 10) - 1;
        const day = parseInt(numericDate[2], 10);
        const yearRaw = numericDate[3] ? parseInt(numericDate[3], 10) : undefined;
        const year = yearRaw ? (yearRaw < 100 ? 2000 + yearRaw : yearRaw) : d.getFullYear();
        d.setFullYear(year, month, day);
        if (!yearRaw && d.getTime() < now.getTime())
            d.setFullYear(d.getFullYear() + 1);
        setTime(d, 9, 0);
    }
    if (text.includes("tomorrow"))
        d.setDate(now.getDate() + 1);
    if (text.includes("next week"))
        d.setDate(now.getDate() + 7);
    if (text.includes("tonight"))
        setTime(d, 18, 0);
    if (text.includes("morning"))
        setTime(d, 9, 0);
    if (text.includes("afternoon"))
        setTime(d, 13, 0);
    if (text.includes("evening"))
        setTime(d, 18, 0);
    if (text.includes("noon"))
        setTime(d, 12, 0);
    if (text.includes("midnight"))
        setTime(d, 0, 0);
    const weekday = text.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
    if (weekday)
        moveToNextWeekday(d, weekday[1]);
    const time = text.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) ||
        text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/);
    if (time) {
        let hour = parseInt(time[1], 10);
        const minute = time[2] ? parseInt(time[2], 10) : 0;
        const ampm = time[3];
        if (ampm === "pm" && hour < 12)
            hour += 12;
        if (ampm === "am" && hour === 12)
            hour = 0;
        if (!ampm && hour >= 1 && hour <= 7 && /\b(tonight|evening|dinner|date|gym|practice|game|appointment|doctor|dentist|reservation|after work)\b/.test(text)) {
            hour += 12;
        }
        setTime(d, hour, minute);
    }
    return d;
}
function monthDateRegex(global = false) {
    return new RegExp("\\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b", global ? "g" : "");
}
function monthIndexFromName(name) {
    const key = name.toLowerCase().slice(0, 3);
    return { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }[key] ?? 0;
}
function setTime(d, hour, minute) {
    d.setHours(hour, minute, 0, 0);
}
function moveToNextWeekday(d, weekdayName) {
    const map = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    const target = map[weekdayName];
    const diff = (target + 7 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + diff);
}
function extractEntities(text) {
    const people = [];
    const locations = [];
    const recommendationKind = inferRecommendationKind(text);
    const duration = text.match(/\b(\d{1,3})\s*(min|mins|minutes|hour|hours|hr|hrs)\b/);
    let possibleDurationMinutes;
    if (duration) {
        const n = parseInt(duration[1], 10);
        possibleDurationMinutes = duration[2].startsWith("hour") || duration[2].startsWith("hr") ? n * 60 : n;
    }
    const personMatch = text.match(/\b(with|call|text|email|meet)\s+([a-z][a-z'\-]+)\b/);
    if (personMatch)
        people.push(capitalize(personMatch[2]));
    const locationMatch = text.match(/\b(at|in)\s+([a-z][a-z0-9'\- ]{2,40})\b/);
    if (locationMatch)
        locations.push(titleCase(locationMatch[2]));
    return { people, locations, recommendationKind, possibleDurationMinutes };
}
function inferRecommendationKind(text) {
    if (/\b(movie|film|documentary|watch)\b/.test(text))
        return "MOVIE";
    if (/\b(show|series|episode)\b/.test(text))
        return "SHOW";
    if (/\b(song|track|single|listen)\b/.test(text))
        return "SONG";
    if (/\b(album|record)\b/.test(text))
        return "ALBUM";
    if (/\b(restaurant|sushi|pizza|taco|barbecue|bbq|cafe|diner)\b/.test(text))
        return "RESTAURANT";
    if (/\b(book|novel|read)\b/.test(text))
        return "BOOK";
    if (/\b(podcast)\b/.test(text))
        return "PODCAST";
    if (/\b(game|play)\b/.test(text))
        return "GAME";
    if (/\b(place|park|museum|store)\b/.test(text))
        return "PLACE";
    return undefined;
}
function inferCalendarType(text, ctx) {
    const t = normalize(text);
    if (/\b(work|meeting|standup|client|shift|boss|production|deadline)\b/.test(t))
        return "WORK";
    if (/\b(personal|family|kid|kids|doctor|dentist|gym|date|dinner)\b/.test(t))
        return "PERSONAL";
    return ctx.preferences.defaultCalendar;
}
function inferEnergy(text) {
    const t = normalize(text);
    if (/\bquick|easy|small|simple|5 min|five min|low energy\b/.test(t))
        return "LOW";
    if (/\bdeep|hard|big|project|research|build|write|high energy\b/.test(t))
        return "HIGH";
    return "MEDIUM";
}
function inferNextStep(text) {
    const t = cleanTitle(text).toLowerCase();
    if (/call\b/.test(t))
        return "Open phone/contact and make the call.";
    if (/email\b|reply\b/.test(t))
        return "Open email and write the first sentence.";
    if (/buy\b|pick up\b/.test(t))
        return "Add it to the shopping list or choose where to get it.";
    if (/schedule\b|appointment\b/.test(t))
        return "Find the phone number or booking page.";
    if (/clean\b/.test(t))
        return "Clear one visible surface for two minutes.";
    return "Do the smallest visible first step for two minutes.";
}
function inferQuestionTimeWindow(text, now) {
    const start = new Date(now);
    const end = new Date(now);
    if (text.includes("tonight")) {
        setTime(start, 17, 0);
        setTime(end, 23, 59);
        return { start: start.toISOString(), end: end.toISOString() };
    }
    if (text.includes("today")) {
        setTime(start, 0, 0);
        setTime(end, 23, 59);
        return { start: start.toISOString(), end: end.toISOString() };
    }
    if (text.includes("tomorrow")) {
        start.setDate(start.getDate() + 1);
        end.setDate(end.getDate() + 1);
        setTime(start, 0, 0);
        setTime(end, 23, 59);
        return { start: start.toISOString(), end: end.toISOString() };
    }
    if (text.includes("this week")) {
        setTime(start, 0, 0);
        end.setDate(end.getDate() + 7);
        setTime(end, 23, 59);
        return { start: start.toISOString(), end: end.toISOString() };
    }
    return undefined;
}
function determineAssistMode(text) {
    if (matchesAny(text, BOREDOM_PATTERNS))
        return "BORED_PRODUCTIVE";
    if (/\b(overwhelmed|too much|spiral|stressed)\b/.test(text))
        return "OVERWHELMED_MICROSTEPS";
    if (matchesAny(text, CANT_START_PATTERNS))
        return "CANT_START";
    if (/\b(plan my day|what should i do|help me plan)\b/.test(text))
        return "PLAN_MY_DAY";
    return "OVERWHELMED_MICROSTEPS";
}
function detectSafety(text) {
    if (matchesAny(text, CRISIS_PATTERNS)) {
        return { level: "CRISIS", reason: "Possible self-harm or emergency language" };
    }
    if (matchesAny(text, SAFETY_SUPPORT_PATTERNS)) {
        return { level: "SUPPORT", reason: "Distress language detected" };
    }
    return { level: "NONE" };
}
function splitBrainDump(rawText) {
    const stripped = rawText
        .replace(/^i need to:?/i, "")
        .replace(/^melt it:?/i, "")
        .trim();
    const byLines = stripped
        .split(/\n|•|- /)
        .map((s) => s.trim())
        .filter(Boolean);
    if (byLines.length > 1)
        return byLines;
    const bySeparators = stripped
        .split(/;|,(?=\s*(call|buy|schedule|watch|check|email|text|clean|finish|start|look|remember|pick up)\b)/i)
        .map((s) => s.trim())
        .filter((s) => s && !/^(call|buy|schedule|watch|check|email|text|clean|finish|start|look|remember|pick up)$/i.test(s));
    return bySeparators.length > 1 ? bySeparators : [rawText.trim()];
}
// ---------------------------
// Patterns
// ---------------------------
const QUESTION_PATTERNS = [
    /^(do|did|will|would|can|could|should|am|are|is|was|were|have|has)\b/,
    /^(what|when|where|who|why|how)\b/,
    /\b(do i have|am i free|what do i have|what's on|anything at|plans at|plans tonight)\b/,
];
const PLAN_PATTERNS = [/\b(plan my day|plan tomorrow|help me plan|what should i do)\b/];
const COMMAND_PATTERNS = [/\b(show|open|go to|view)\s+(calendar|tasks|notes|ideas|recommendations|brain dump)\b/];
const BOREDOM_PATTERNS = [/\b(i'?m bored|bored|nothing to do|entertain me)\b/];
const CANT_START_PATTERNS = [/\b(can'?t start|stuck|task paralysis|don'?t know where to start|avoid|procrastinating)\b/];
const SAFETY_SUPPORT_PATTERNS = [/\b(overwhelmed|spiraling|panic|burned out|burnt out|i can'?t do this)\b/];
const CRISIS_PATTERNS = [/\b(kill myself|suicide|end my life|hurt myself|self harm|self-harm|i don'?t want to live)\b/];
const EVENT_PATTERNS = [
    /\b(meeting|appointment|doctor|dentist|dinner|lunch|date|call with|meet with|standup|practice|game|flight|reservation)\b/,
    /\b(at|from)\s+\d{1,2}(:\d{2})?\s*(am|pm)?\b/,
];
const TASK_PATTERNS = [
    /\b(need to|todo|to do|remind me to|remember to|don'?t forget|buy|call|email|text|finish|start|submit|pay|pick up|drop off|clean|schedule|book|renew|check|look into|fix)\b/,
];
const IDEA_PATTERNS = [/\b(idea|what if|maybe we could|app idea|business idea|concept|brainstorm)\b/];
const NOTE_PATTERNS = [/\b(note|remember that|keep in mind|save this|for later|thought|reference)\b/];
const RECOMMENDATION_PATTERNS = [
    /\b(check out|watch|listen to|try|read|recommend|recommended|someone said|you should|restaurant|movie|song|album|book|podcast|game)\b/,
];
const SOCIAL_EVENT_PATTERNS = [/\b(with|meet|meeting|dinner|lunch|call with|hang out)\b/];
// ---------------------------
// Display utilities
// ---------------------------
function labelForCategory(cat) {
    return {
        CALENDAR: "Calendar event",
        TASK: "Task",
        IDEA: "Idea",
        RECOMMENDATION: "Recommendation",
        NOTE: "Note",
        BRAIN_DUMP: "Brain dump",
    }[cat];
}
function iconForCategory(cat) {
    return {
        CALENDAR: "📅",
        TASK: "✅",
        IDEA: "💡",
        RECOMMENDATION: "⭐",
        NOTE: "📝",
        BRAIN_DUMP: "🧠",
    }[cat];
}
function describeSearch(query) {
    const scope = query.scope.includes("ALL") ? "everything" : query.scope.join(", ").toLowerCase();
    return query.timeWindow ? `Searching ${scope} in that time window.` : `Searching ${scope}.`;
}
function toConfidenceBand(confidence, ctx) {
    if (confidence >= ctx.preferences.autoCommitThreshold)
        return "AUTO";
    if (confidence >= ctx.preferences.reviewThreshold)
        return "REVIEW";
    return "ASK_ONE_TAP";
}
function matchesAny(text, patterns) {
    return patterns.some((p) => p.test(text));
}
function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
function wordCount(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
}
function capitalize(s) {
    return s ? s[0].toUpperCase() + s.slice(1) : s;
}
function titleCase(s) {
    return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
/**
 * Use this when rules disagree or confidence is low.
 * Recommended product behavior:
 * - Run rules first for speed and privacy.
 * - Call an LLM only when confidence is low, or when text is complex.
 * - Never let the LLM directly write to storage; convert it into the same Action objects.
 */
export function shouldAskLLM(classification) {
    const top = classification.categoryScores[0]?.score ?? 0;
    const second = classification.categoryScores[1]?.score ?? 0;
    const closeRace = Math.abs(top - second) < 0.12;
    return classification.confidenceBand === "ASK_ONE_TAP" || closeRace || classification.title.length > 160;
}
