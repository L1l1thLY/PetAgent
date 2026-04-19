import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  real,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const petagentPlugins = pgTable(
  "petagent_plugins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    version: text("version").notNull(),
    source: text("source").notNull(),
    manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    installedAt: timestamp("installed_at", { withTimezone: true }).defaultNow(),
    lastLoadedAt: timestamp("last_loaded_at", { withTimezone: true }),
    loadError: text("load_error"),
  },
  (table) => ({
    companyIdx: index("petagent_plugins_company_idx").on(table.companyId),
    nameIdx: index("petagent_plugins_name_idx").on(table.name),
  }),
);

export const petagentPluginRoutes = pgTable(
  "petagent_plugin_routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pluginId: uuid("plugin_id")
      .notNull()
      .references(() => petagentPlugins.id, { onDelete: "cascade" }),
    routeType: text("route_type").notNull(),
    pattern: text("pattern").notNull(),
    handler: text("handler").notNull(),
    priority: integer("priority").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => ({
    pluginIdx: index("petagent_plugin_routes_plugin_idx").on(table.pluginId),
    typeIdx: index("petagent_plugin_routes_type_idx").on(table.routeType),
  }),
);

export const petagentPluginKpi = pgTable(
  "petagent_plugin_kpi",
  {
    pluginId: uuid("plugin_id")
      .notNull()
      .references(() => petagentPlugins.id, { onDelete: "cascade" }),
    metricKey: text("metric_key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    value: real("value").notNull(),
    sampleCount: integer("sample_count").notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.pluginId, table.metricKey, table.windowStart],
    }),
  }),
);
