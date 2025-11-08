import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export const GET: RequestHandler = async ({ params }) => {
  // Read buchungen.json from data directory
  const buchungenPath = resolve('data/buchungen.json');
  const buchungenContent = readFileSync(buchungenPath, 'utf-8');
  const buchungenData = JSON.parse(buchungenContent);
  const BUCHUNGEN = buchungenData.data;
  
  const { id } = params;

  const buchung = BUCHUNGEN.find((b: any) => b.id === parseInt(id));
  if (!buchung) {
    throw error(404, `Buchung ${id} nicht gefunden`);
  }

  return json(buchung, {
    headers: {
      // example cache header; tweak for your needs
      'Cache-Control': 'public, max-age=60'
    }
  });
};
