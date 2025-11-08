import type { PageServerLoad } from './$types';
import kontoData from '$lib/konto.json';
import buchungenData from '$lib/buchungen.json';

export const load: PageServerLoad = async () => {
  return {
    buchungen: buchungenData.data,
    kontos: kontoData
  };
};