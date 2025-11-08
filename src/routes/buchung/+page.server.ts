import type { PageServerLoad } from './$types';
import kontoData from '$lib/konto.json';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export const load: PageServerLoad = async () => {
  // Read buchungen.json from data directory
  const buchungenPath = resolve('data/buchungen.json');
  const buchungenContent = readFileSync(buchungenPath, 'utf-8');
  const buchungenData = JSON.parse(buchungenContent);
  
  return {
    buchungen: buchungenData.data,
    kontos: kontoData
  };
};