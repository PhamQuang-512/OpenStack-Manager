import { Icon, List } from "@raycast/api";
import { useMemo, useState } from "react";
import { useFetchWithCache } from "../../core/useFetchWithCache";
import { cacheKey, getServices } from "../index";
import { Project } from "../types";

const ALL_PROJECTS = "__all__";

/**
 * Project id → name map for a cloud. Shared across views through the
 * fetch store; failures are silent and fall back to showing short ids.
 */
export function useProjectNames(configName: string, binaryPath: string): Map<string, string> {
  const services = getServices(configName, binaryPath);
  const { data } = useFetchWithCache<Project[]>(
    cacheKey("projects", configName),
    () => services.projects.listProjects(),
    { silent: true },
  );
  return useMemo(() => new Map((data ?? []).map((p) => [p.id, p.name])), [data]);
}

/**
 * Adds an "All Projects / <project>" dropdown to a list view and filters
 * `items` by the selected project. Only projects that own at least one
 * item are offered.
 */
export function useProjectFilter<T>(
  configName: string,
  binaryPath: string,
  items: T[] | undefined,
  projectIdOf: (item: T) => string | undefined,
) {
  const projectNames = useProjectNames(configName, binaryPath);
  const [selected, setSelected] = useState(ALL_PROJECTS);

  const projectName = (id?: string | null) => (id ? (projectNames.get(id) ?? id.slice(0, 8)) : "");

  const options = useMemo(() => {
    const ids = new Set((items ?? []).map(projectIdOf).filter((id): id is string => Boolean(id)));
    return [...ids]
      .map((id) => ({ id, name: projectNames.get(id) ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, projectNames]);

  // Fall back to "All" if the selected project no longer owns any item (e.g. after a refresh)
  const effective = options.some((o) => o.id === selected) ? selected : ALL_PROJECTS;

  const filtered = useMemo(
    () => (effective === ALL_PROJECTS ? (items ?? []) : (items ?? []).filter((i) => projectIdOf(i) === effective)),
    [items, effective],
  );

  const dropdown = (
    <List.Dropdown tooltip="Filter by Project" onChange={setSelected} value={effective}>
      <List.Dropdown.Item title="All Projects" value={ALL_PROJECTS} icon={Icon.Globe} />
      <List.Dropdown.Section title="Projects">
        {options.map((o) => (
          <List.Dropdown.Item key={o.id} title={o.name} value={o.id} icon={Icon.Folder} />
        ))}
      </List.Dropdown.Section>
    </List.Dropdown>
  );

  return { filtered, dropdown, projectName };
}

/** List accessory showing the owning project. */
export function projectAccessory(name: string): List.Item.Accessory[] {
  return name ? [{ icon: Icon.Folder, text: name, tooltip: `Project: ${name}` }] : [];
}
