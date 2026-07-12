import { customType, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Postgres `bytea` mapped to `Uint8Array` in app code (Yjs document state is a
 * `Uint8Array`). node-postgres hands back a `Buffer` for bytea, which we wrap
 * as a `Uint8Array`; on the way in we accept any `Uint8Array` and store its
 * bytes verbatim.
 */
export const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value) {
    return Buffer.from(value);
  },
  fromDriver(value) {
    return new Uint8Array(value);
  },
});

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  familyId: uuid("family_id").notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
  revokedAt: timestamptz("revoked_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

/** Server-persisted Yjs document state, keyed by doc name (e.g. `board:<userId>`). */
export const yjsDocuments = pgTable("yjs_documents", {
  docName: text("doc_name").primaryKey(),
  state: bytea("state").notNull(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

/** Server-side unfurl cache (Unit 3.7), keyed by normalized URL. */
export const linkMetadataCache = pgTable("link_metadata_cache", {
  url: text("url").primaryKey(),
  title: text("title"),
  iconUrl: text("icon_url"),
  fetchedAt: timestamptz("fetched_at").notNull().defaultNow(),
});

export const schema = {
  users,
  refreshTokens,
  yjsDocuments,
  linkMetadataCache,
};
