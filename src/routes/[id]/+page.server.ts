import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, fetch }) => {
  const { id } = params;

  const res = await fetch(`/api/buchung/${id}`);
  if (!res.ok) {
    // Surface API error to the page (lets +error.svelte handle it nicely)
    throw error(res.status, await res.text());
  }

  const buchung = await res.json();
  return { id, buchung };
};
