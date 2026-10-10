import { useStore } from '../data/store';
import type { Lang } from '../data/types';
import { en, type Dict } from './en';
import { hi } from './hi';
import { mr } from './mr';

export const dictionaries: Record<Lang, Dict> = { en, mr, hi };
export type { Dict };

/** UI strings for the language chosen in the header. */
export function useT(): Dict {
  return dictionaries[useStore((s) => s.prefs.lang)];
}

/** Translate a tag: built-in keys are translated, custom tags shown as typed. */
export function tagLabel(t: Dict, tag: string) {
  return (t.tags as Record<string, string>)[tag] ?? tag;
}
