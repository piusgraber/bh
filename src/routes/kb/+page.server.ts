import type { PageServerLoad } from './$types';
import kontoData from '$lib/konto.json';
import buchungenData from '$lib/buchungen.json';

export const load: PageServerLoad = async () => {
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