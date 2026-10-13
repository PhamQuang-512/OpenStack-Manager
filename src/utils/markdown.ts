/**
 * Escapes markdown metacharacters in user-controlled text (resource names,
 * descriptions) before embedding it in Detail markdown. Names come from
 * every project, so `![x](https://...)` must not render as a remote image.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]()!<>#|~]/g, "\\$&").replace(/\r?\n/g, " ");
}
