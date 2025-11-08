import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';

// Convert date from DD.MM.YYYY to YYYY-MM-DD
function formatDateToISO(dateStr: string): string {
    if (!dateStr || !dateStr.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
        return dateStr; // Return as is if not in expected format
    }
    
    const [day, month, year] = dateStr.split('.');
    return `${year}-${month}-${day}`;
}

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { data, fileName, importDate } = await request.json();
        
        if (!data || !Array.isArray(data) || data.length === 0) {
            throw error(400, 'Keine gültigen Daten zum Importieren erhalten');
        }

        const IMPORT_FILE_PATH = resolve('src/lib/import.json');
        const BUCHUNGEN_FILE_PATH = resolve('data/buchungen.json');
        
        // Find the largest ID in buchungen.json
        let maxId = 0;
        try {
            const buchungenContent = readFileSync(BUCHUNGEN_FILE_PATH, 'utf-8');
            const buchungenData = JSON.parse(buchungenContent);
            const buchungen = buchungenData.data || buchungenData;
            
            if (Array.isArray(buchungen) && buchungen.length > 0) {
                maxId = Math.max(...buchungen.map((b: any) => parseInt(b.id) || 0));
            }
            
            console.log(`Found largest ID in buchungen.json: ${maxId}`);
        } catch (err) {
            console.warn('Could not read buchungen.json, starting IDs from 1:', err);
            maxId = 0;
        }
        
        // Extract first 4 digits from filename for mapping
        const firstFourDigits = fileName.replace(/\D/g, '').substring(0, 4) || '1000';
        
        // Map CSV data to buchungen format
        const mappedData = data.map((record: any, index: number) => {
            const betrag = parseFloat(record.betrag) || 0;
            const id = maxId + 1 + index;
            
            let soll: number;
            let haben: number;
            let finalBetrag: number;
            
            if (betrag < 0) {
                // Negative amount: soll=99999, haben=first 4 digits, betrag=abs(betrag)
                soll = 99999;
                haben = parseInt(firstFourDigits);
                finalBetrag = Math.abs(betrag);
            } else {
                // Positive amount: soll=first 4 digits, haben=99999
                soll = parseInt(firstFourDigits);
                haben = 99999;
                finalBetrag = betrag;
            }
            
            const formattedDatum = formatDateToISO(record.datum || '');
            const formattedValuta = formatDateToISO(record.valuta || '');
            
            return {
                id: id,
                datum: formattedDatum,
                soll: soll,
                haben: haben,
                buchungstext: record.avisierungstext || '',
                betrag: finalBetrag,
                originaltext: record.avisierungstext || '',
                sollkd: null,
                wer: null,
                was: null,
                classifier: null,
                testfield: null,
                subkonto: 0,
                class: null,
                sollSaldo: 0,
                habenSaldo: 0,
                kategorie: '',
                kto: formattedValuta || formattedDatum,
                datestr: formattedDatum,
                // Original CSV fields for reference
                _original: {
                    gutschrift: record.gutschrift,
                    lastschrift: record.lastschrift,
                    valuta: record.valuta,
                    saldo: record.saldo
                }
            };
        });
        
        // Create the import data structure
        const importData = {
            metadata: {
                originalFileName: fileName,
                importDate: importDate,
                recordCount: mappedData.length,
                importedBy: 'CSV Import System',
                mapping: {
                    firstFourDigitsFromFilename: firstFourDigits,
                    largestExistingId: maxId,
                    startingNewId: maxId + 1,
                    description: 'IDs start from largest buchungen.json ID + 1. Negative amounts: soll=99999, haben=first4digits, betrag=abs(betrag). Positive amounts: soll=first4digits, haben=99999'
                }
            },
            data: mappedData
        };

        // Write to import.json file
        writeFileSync(IMPORT_FILE_PATH, JSON.stringify(importData, null, 2), 'utf-8');
        
        console.log(`Successfully imported ${data.length} records to ${IMPORT_FILE_PATH}`);

        return json({ 
            success: true, 
            message: `${data.length} Datensätze erfolgreich importiert`,
            filePath: '/lib/import.json',
            recordCount: data.length
        });
        
    } catch (err) {
        console.error('Error importing data:', err);
        const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
        throw error(500, `Import fehlgeschlagen: ${message}`);
    }
};