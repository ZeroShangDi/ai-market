import { readFile } from 'node:fs/promises';

// Capability definitions are versioned independently from task/session persistence.
export async function loadExpert(id = 'customer-follow-up', version = '1') {
  const registered = new Set(['customer-follow-up:1', 'document-review:1']);
  if (!registered.has(`${id}:${version}`)) throw new Error('Unknown expert version');
  const base = new URL('../resources/', import.meta.url);
  const definition = JSON.parse(await readFile(new URL(`experts/${id}/v${version}/expert.json`, base), 'utf8'));
  const instructions = await readFile(new URL(`skills/${definition.skill}/SKILL.md`, base), 'utf8');
  return { ...definition, instructions };
}
