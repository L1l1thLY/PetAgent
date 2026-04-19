import type { UIAdapterModule } from "../types";
import { parseHermesStdoutLine } from "hermes-petagent-adapter/ui";
import { SchemaConfigFields, buildSchemaAdapterConfig } from "../schema-config-fields";
import { buildHermesConfig } from "hermes-petagent-adapter/ui";

export const hermesLocalUIAdapter: UIAdapterModule = {
  type: "hermes_local",
  label: "Hermes Agent",
  parseStdoutLine: parseHermesStdoutLine,
  ConfigFields: SchemaConfigFields,
  buildAdapterConfig: buildSchemaAdapterConfig,
};
