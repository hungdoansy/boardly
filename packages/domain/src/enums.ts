// Domain enums. Modeled as `const` objects (not TS `enum`) so they are
// tree-shakeable, isolatedModules-safe, and serialize as plain JSON values.

/** Card priority, low→high. Stored on the card as a 0–4 number. */
export const Priority = {
  None: 0,
  Low: 1,
  Medium: 2,
  High: 3,
  Urgent: 4,
} as const;
export type PriorityValue = (typeof Priority)[keyof typeof Priority];
export type PriorityName = keyof typeof Priority;
export const PRIORITY_NAMES: Record<PriorityValue, PriorityName> = {
  0: "None",
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

/** Display name + color per priority level (DESIGN.md §2 encodings). */
export const PRIORITY_META: Record<PriorityValue, { name: PriorityName; color: string }> = {
  0: { name: "None", color: "#6B6F76" },
  1: { name: "Low", color: "#8A8F98" },
  2: { name: "Medium", color: "#4EA7FC" },
  3: { name: "High", color: "#E2B341" },
  4: { name: "Urgent", color: "#EB5757" },
};

/**
 * Link provider ids. The full extensible provider registry (incl. GitHub PR /
 * issue) is built in Unit 2.7; this is the base set the domain helpers detect.
 */
export const LinkProvider = {
  Slack: "slack",
  Linear: "linear",
  GitHub: "github",
  Claude: "claude",
  ClaudeCode: "claude-code",
  Figma: "figma",
  Notion: "notion",
  GoogleDocs: "google_docs",
  GoogleSheets: "google_sheets",
  GoogleDrive: "google_drive",
  GoogleCalendar: "google_calendar",
  Jira: "jira",
  Confluence: "confluence",
  Loom: "loom",
  Miro: "miro",
  Dropbox: "dropbox",
  YouTube: "youtube",
  Zoom: "zoom",
  Asana: "asana",
  Trello: "trello",
  Airtable: "airtable",
  Facebook: "facebook",
  Twitter: "twitter",
  Instagram: "instagram",
  LinkedIn: "linkedin",
  Reddit: "reddit",
  Discord: "discord",
  TikTok: "tiktok",
  Pinterest: "pinterest",
  WhatsApp: "whatsapp",
  Telegram: "telegram",
  Medium: "medium",
  StackOverflow: "stackoverflow",
  GitLab: "gitlab",
  Bitbucket: "bitbucket",
  Npm: "npm",
  DockerHub: "dockerhub",
  Spotify: "spotify",
  Twitch: "twitch",
  Vimeo: "vimeo",
  Behance: "behance",
  Dribbble: "dribbble",
  CodePen: "codepen",
  Replit: "replit",
  GoogleMeet: "google_meet",
  Stripe: "stripe",
  Wikipedia: "wikipedia",
  Generic: "generic",
} as const;
export type LinkProvider = (typeof LinkProvider)[keyof typeof LinkProvider];
