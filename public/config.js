// ---- Site configuration -------------------------------------------------
// This file is the ONLY place the message text lives. Edit here, redeploy,
// and every page and every embed on other sites picks up the new text.
// The count is stored separately (in the Worker) and is never affected.

window.MM_CONFIG = {
  // Cloudflare Turnstile site key (public). Leave empty to disable the
  // human check during local testing. Set it before launch.
  turnstileSiteKey: "0x4AAAAAAFeCZ7c4Z9K2rLbh",

  // Where the message goes.
  formUrl: "https://www.whitehouse.gov/contact/",

  // The message people copy. Keep the "[Your name]" line last.
  message: [
    "Dear Mr. President,",
    "",
    "Please consider steering your administration toward:",
    "",
    "1. Supporting legal immigration through comprehensive immigration reform",
    "2. Supporting Ukraine rather than Russia",
    "3. Reducing corruption in government",
    "4. Staying out of other nations’ elections",
    "5. Keeping the United States a democratic republic, with strong institutions, the rule of law, and the peaceful transfer of power",
    "6. Rebuilding our alliances and America’s role as a leader in the free world",
    "7. Addressing the national debt and deficits with urgency and compassion",
    "",
    "Thank you very much.",
    "",
    "[Your name]",
  ].join("\n"),

  // Shown on the page so the count's meaning stays honest as wording changes.
  versionHistory: [
    { date: "2026-10-20", note: "Initial message (five points)." },
    { date: "2026-10-20", note: "Wording tightened; added points 6 (alliances) and 7 (debt and deficits) before launch." },
  ],

  // Pre-written text for the Share button (the link is appended automatically).
  shareText: "One short, positive, non-partisan message to the White House. Takes two minutes, and there's a live count.",

  // Public source code. Fill in once the GitHub repository exists.
  sourceUrl: "",
};
