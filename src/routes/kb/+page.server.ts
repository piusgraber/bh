import type { PageServerLoad } from './$types';
import kontoData from '$lib/konto.json';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export const load: PageServerLoad = async () => {
    // Read buchungen.json from data directory
    const buchungenPath = resolve('data/buchungen.json');
    const buchungenContent = readFileSync(buchungenPath, 'utf-8');
    const buchungenData = JSON.parse(buchungenContent);
    const buchungen = buchungenData.data;
    
    // Get unique konto values (combination of soll and haben)
    const allKontos = new Set<number>();
    
    buchungen.forEach((buchung: any) => {
        allKontos.add(buchung.soll);
        allKontos.add(buchung.haben);
    });
    
    const kontos = Array.from(allKontos).sort((a, b) => a - b);
    
    return {
        buchungen,
        kontos,
        kontoNames: kontoData
    };
};