/**
 * placeholder.js — builds a stand-in widget definition for tools that are
 * scheduled for a later milestone.
 *
 * Placeholders use the same definition/instance contract as real widgets, so
 * adding, removing, minimizing, restoring, spotlighting and layout persistence
 * are exercised by the real code path — only the content is a stub.
 */

import { el } from '../utils.js';
import { icon, hasIcon } from '../ui/icons.js';

/**
 * @param {{id:string, title:string, icon:string, size?:string, description:string, milestone:number}} spec
 */
export function createPlaceholder(spec) {
  return {
    id: spec.id,
    title: spec.title,
    icon: spec.icon,
    size: spec.size || 'md',
    singleton: false,
    placeholder: true,
    milestone: spec.milestone,
    description: spec.description,

    create() {
      const element = el('div', { class: 'w-stage w-placeholder' }, [
        hasIcon(spec.icon)
          ? el('span', { class: 'w-placeholder__icon', 'aria-hidden': 'true', html: icon(spec.icon, 30) })
          : el('span', { class: 'w-placeholder__icon', 'aria-hidden': 'true', text: spec.icon }),
        el('p', { class: 'w-placeholder__title', text: spec.title }),
        el('p', { class: 'w-placeholder__text', text: spec.description }),
        el('p', { class: 'w-placeholder__tag', text: 'Coming soon' }),
      ]);
      return { element };
    },
  };
}
