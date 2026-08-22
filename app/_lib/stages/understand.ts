import type { Labeled, SiteMap } from "../types";

/**
 * Stage 3: decide what each harvested control actually is.
 *
 * Stage 4 cannot build `search_employees_by_name(employee_name)` from a bare DOM
 * node — it needs to know which input is the search box and what kind of value it
 * carries. This stage answers that with a rule table: hundreds of controls
 * classified per app with no tokens, no latency, and the same answer every run,
 * which is what keeps a recompile reproducible.
 *
 * The trade-off is that the rules read English label text. See the limitations
 * section of the README.
 */

/** Roles worth distinguishing when deciding which controls become tool parameters. */
export const ELEMENT_ROLES = [
  "search_input",
  "filter",
  "submit",
  "nav",
  "create",
  "destructive",
  "pagination",
  "other",
] as const;

/**
 * The value a field carries, in priority order.
 *
 * This becomes the generated tool parameter's type and description, so a wrong
 * guess here shows up in the tool catalogue an agent reads.
 */
const ENTITIES: [RegExp, string][] = [
  [/e-?mail/, "email"],
  [/\bid\b|identifier|number|code|barcode|sku/, "identifier"],
  [/date|from|to\b|since|until|deadline/, "date"],
  [/title|position|job|designation/, "job_title"],
  [/status|state|enabled|active/, "status"],
  [/name|employee|person|user|candidate/, "person_name"],
];

const entityFor = (label: string) => ENTITIES.find(([re]) => re.test(label))?.[1];

/** Classify one control from its label, element kind and input type. */
export function classify(
  label: string,
  kind: string,
  inputType?: string,
): { semantic: string; entity?: string } {
  const l = label.toLowerCase().trim();

  if (/delete|remove|destroy|purge|discard|void|cancel order/.test(l)) {
    return { semantic: "destructive" };
  }
  if (/^\+|add|create|new\b|register|assign/.test(l)) return { semantic: "create" };
  if (/^\d+$/.test(l) || /next|previous|prev\b|first|last|load more|page/.test(l)) {
    return { semantic: "pagination" };
  }

  if (kind === "button") {
    return /search|find|apply|go\b|submit|save|update|look ?up|run/.test(l)
      ? { semantic: "submit" }
      : { semantic: "other" };
  }
  if (kind === "link") return { semantic: "nav" };

  // Inputs and selects: a free-text field is something to search by, whereas a
  // constrained one narrows an existing result set.
  const entity = entityFor(l);
  if (kind === "select" || inputType === "checkbox" || inputType === "radio") {
    return { semantic: "filter", ...(entity ? { entity } : {}) };
  }
  if (inputType === "date") return { semantic: "filter", entity: "date" };
  return { semantic: "search_input", ...(entity ? { entity } : {}) };
}

export async function understand(
  siteMap: SiteMap,
  log: (m: string) => void,
): Promise<Labeled[]> {
  const labels: Labeled[] = siteMap.screens.flatMap((screen) =>
    screen.elements.map((element) => ({
      elementId: `${screen.id}:${element.id}`,
      ...classify(element.label, element.kind, element.inputType),
    })),
  );

  const counts = labels.reduce<Record<string, number>>((acc, l) => {
    acc[l.semantic] = (acc[l.semantic] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([role, n]) => `${n} ${role}`)
    .join(", ");

  log(`Classified ${labels.length} controls: ${summary}`);
  return labels;
}
