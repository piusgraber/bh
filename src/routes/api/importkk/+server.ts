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

// Parse credit card CSV content
function parseKKCSV(csvContent: string): any[] {
    const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line);
    
    console.log(`Total lines in CSV: ${lines.length}`);
    
    // Find the header line (starts with "Rechnungsperiode;")
    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('Rechnungsperiode;') || lines[i].startsWith('Rechnungsperiode\t')) {
            headerIndex = i;
            break;
        }
    }
    
    if (headerIndex === -1) {
        throw new Error('CSV-Header nicht gefunden. Erwartet: "Rechnungsperiode;Buchungsdatum;..."');
    }
    
    console.log(`Found header at line ${headerIndex + 1}`);
    
    // Detect delimiter (semicolon or tab)
    const delimiter = lines[headerIndex].includes('\t') ? '\t' : ';';
    console.log(`Using delimiter: ${delimiter === '\t' ? 'TAB' : 'SEMICOLON'}`);
    
    // Parse header line
    const headers = lines[headerIndex].split(delimiter).map(h => h.trim());
    console.log('CSV Headers:', headers);
    
    // Expected headers
    const requiredHeaders = ['Buchungsdatum', 'Buchungsdetails'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    
    if (missingHeaders.length > 0) {
        throw new Error(`Fehlende erforderliche Spalten: ${missingHeaders.join(', ')}`);
    }

    // Find column indices
    const buchungsdatumIdx = headers.indexOf('Buchungsdatum');
    const buchungsdetailsIdx = headers.indexOf('Buchungsdetails');
    const gutschriftIdx = headers.indexOf('Gutschrift in CHF');
    const lastschriftIdx = headers.indexOf('Lastschrift in CHF');
    
    console.log('Column indices:', {
        buchungsdatum: buchungsdatumIdx,
        buchungsdetails: buchungsdetailsIdx,
        gutschrift: gutschriftIdx,
        lastschrift: lastschriftIdx
    });

    // Parse data lines
    const records = [];
    for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = line.split(delimiter).map(v => v.trim());
        
        // Skip if not enough values
        if (values.length < headers.length) {
            console.log(`Skipping line ${i + 1}: insufficient columns`);
            continue;
        }
        
        const buchungsdatum = values[buchungsdatumIdx] || '';
        const buchungsdetails = values[buchungsdetailsIdx] || '';
        
        // Skip empty records
        if (!buchungsdatum || !buchungsdetails) {
            console.log(`Skipping empty record at line ${i + 1}`);
            continue;
        }

        try {
            // Parse Gutschrift and Lastschrift
            const gutschriftStr = values[gutschriftIdx]?.replace(/['"]/g, '') || '';
            const lastschriftStr = values[lastschriftIdx]?.replace(/['"]/g, '') || '';
            
            let betrag = 0;
            let soll = 99999;
            let haben = 99999;
            
            // Calculate betrag from Gutschrift (positive) or Lastschrift (negative)
            if (gutschriftStr && gutschriftStr !== '') {
                betrag = parseFloat(gutschriftStr.replace(',', '.')) || 0;
                // Positive amount (Gutschrift/credit)
                soll = 1013; // Credit card account receives money
                haben = 99999;
            } else if (lastschriftStr && lastschriftStr !== '') {
                betrag = -(parseFloat(lastschriftStr.replace(',', '.')) || 0);
                // Negative amount (Lastschrift/debit)
                soll = 99999;
                haben = 1013; // Credit card account pays money
            } else {
                console.log(`Skipping line ${i + 1}: no amount found`);
                continue;
            }
            
            // Transform to buchungen format
            const transformedRecord = {
                datum: formatDateToISO(buchungsdatum),
                buchungstext: buchungsdetails.replace(/^["']|["']$/g, ''), // Remove surrounding quotes
                betrag: betrag,
                soll: soll,
                haben: haben,
                kategorie: '',
                bereich: ''
            };
            
            records.push(transformedRecord);
        } catch (err) {
            console.error(`Error parsing line ${i + 1}:`, err);
        }
    }

    console.log(`Parsed ${records.length} records from credit card CSV`);
    return records;
}

// Handle CSV file upload and parsing
export const POST: RequestHandler = async ({ request }) => {
    try {
        const formData = await request.formData();
        const csvFile = formData.get('csvFile') as File;
        
        if (!csvFile) {
            throw error(400, 'Keine CSV-Datei erhalten');
        }
        
        console.log(`Processing credit card CSV file: ${csvFile.name}`);
        
        // Read file content
        const csvContent = await csvFile.text();
        
        // Parse CSV
        const parsedData = parseKKCSV(csvContent);
        
        if (parsedData.length === 0) {
            throw error(400, 'Keine gültigen Daten in der CSV-Datei gefunden');
        }
        
        return json({
            success: true,
            data: parsedData,
            message: `${parsedData.length} Einträge erfolgreich geparst`,
            description: 'Buchungsdatum → Datum, Buchungsdetails → Buchungstext, Gutschrift/Lastschrift → Betrag, 1060 ↔ 99999'
        });
        
    } catch (err: any) {
        console.error('Error processing credit card CSV:', err);
        return json({
            success: false,
            message: err.message || 'Fehler beim Verarbeiten der CSV-Datei'
        }, { status: 400 });
    }
};

// Handle data import to buchungen.json
export const PUT: RequestHandler = async ({ request }) => {
    try {
        const { data } = await request.json();
        
        if (!data || !Array.isArray(data) || data.length === 0) {
            throw error(400, 'Keine gültigen Daten zum Importieren erhalten');
        }

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
        
        // Add IDs to the data
        const dataWithIds = data.map((record: any, index: number) => ({
            ...record,
            id: maxId + 1 + index
        }));

        // Read existing buchungen data
        let existingData;
        try {
            const fileContent = readFileSync(BUCHUNGEN_FILE_PATH, 'utf-8');
            existingData = JSON.parse(fileContent);
        } catch (err) {
            console.warn('Could not read existing buchungen.json, creating new structure');
            existingData = { data: [] };
        }

        // Append new data
        if (!existingData.data) {
            existingData.data = [];
        }
        existingData.data.push(...dataWithIds);

        // Write back to file
        writeFileSync(BUCHUNGEN_FILE_PATH, JSON.stringify(existingData, null, 2));
        
        console.log(`Successfully imported ${dataWithIds.length} credit card records`);

        return json({
            success: true,
            message: `${dataWithIds.length} Einträge erfolgreich importiert`,
            importedCount: dataWithIds.length,
            description: 'IDs start from largest buchungen.json ID + 1. Credit card format: Buchungsdatum → Datum, Gutschrift (positive) / Lastschrift (negative) → Betrag'
        });
        
    } catch (err: any) {
        console.error('Error importing credit card data:', err);
        throw error(500, err.message || 'Fehler beim Importieren der Daten');
    }
};