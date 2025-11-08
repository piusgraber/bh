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

// Parse xfact CSV content
function parseXfactCSV(csvContent: string): any[] {
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
        throw new Error('CSV-Datei muss mindestens eine Kopfzeile und eine Datenzeile enthalten');
    }

    // Parse header line (tab-separated)
    const headers = lines[0].split('\t').map(h => h.trim());
    console.log('CSV Headers:', headers);
    
    // Expected xfact headers
    const expectedHeaders = ['Datum', 'R-Dat', 'Auft. Nr', 'Rech. Nr', 'Adresse', 'Bezeichnung', 'Betrag', 'Art'];
    
    // Check if we have the basic required headers
    const requiredHeaders = ['R-Dat', 'Bezeichnung', 'Betrag'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    
    if (missingHeaders.length > 0) {
        throw new Error(`Fehlende erforderliche Spalten: ${missingHeaders.join(', ')}`);
    }

    // Parse data lines
    const records = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = line.split('\t');
        const record: any = {};
        
        // Map values to headers
        headers.forEach((header, index) => {
            record[header] = values[index]?.trim() || '';
        });
        
        // Skip empty records
        if (!record['Bezeichnung'] || !record['Betrag']) {
            console.log(`Skipping empty record at line ${i + 1}`);
            continue;
        }

        try {
            // Transform to buchungen format
            const transformedRecord = {
                datum: formatDateToISO(record['R-Dat']), // Use R-Dat as datum
                buchungstext: record['Bezeichnung'],
                betrag: parseFloat(record['Betrag'].replace(',', '.')) || 0,
                soll: 1100, // Fixed mapping as requested
                haben: 3600, // Fixed mapping as requested
                kategorie: record['Art'] || '',
                bereich: '',
                // Keep original xfact data for reference
                adresse: record['Adresse'] || '',
                auftragNr: record['Auft. Nr'] || '',
                rechNr: record['Rech. Nr'] || '',
                originalDatum: record['Datum'] || ''
            };
            
            records.push(transformedRecord);
        } catch (err) {
            console.error(`Error parsing line ${i + 1}:`, err);
        }
    }

    console.log(`Parsed ${records.length} records from xfact CSV`);
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
        
        console.log(`Processing xfact CSV file: ${csvFile.name}`);
        
        // Read file content
        const csvContent = await csvFile.text();
        
        // Parse CSV
        const parsedData = parseXfactCSV(csvContent);
        
        if (parsedData.length === 0) {
            throw error(400, 'Keine gültigen Daten in der CSV-Datei gefunden');
        }
        
        return json({
            success: true,
            data: parsedData,
            message: `${parsedData.length} Einträge erfolgreich geparst`,
            description: 'R-Dat → Datum, Bezeichnung → Buchungstext, Betrag → Betrag, 1100 → Soll, 3600 → Haben'
        });
        
    } catch (err: any) {
        console.error('Error processing xfact CSV:', err);
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
        
        console.log(`Successfully imported ${dataWithIds.length} xfact records`);

        return json({
            success: true,
            message: `${dataWithIds.length} Einträge erfolgreich importiert`,
            importedCount: dataWithIds.length,
            description: 'IDs start from largest buchungen.json ID + 1. Xfact format: R-Dat → Datum, Bezeichnung → Buchungstext, 1100 → Soll, 3600 → Haben'
        });
        
    } catch (err: any) {
        console.error('Error importing xfact data:', err);
        throw error(500, err.message || 'Fehler beim Importieren der Daten');
    }
};