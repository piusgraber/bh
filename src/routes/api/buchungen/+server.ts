import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

export const PUT: RequestHandler = async ({ request }) => {
    try {
        const updatedBuchung = await request.json();
        
        const BUCHUNGEN_FILE_PATH = resolve('data/buchungen.json');
        
        // Read current data
        const fileContent = readFileSync(BUCHUNGEN_FILE_PATH, 'utf-8');
        const buchungenData = JSON.parse(fileContent);
        
        // Find and update the specific buchung
        const index = buchungenData.data.findIndex((b: any) => b.id === updatedBuchung.id);
        
        if (index === -1) {
            throw error(404, `Buchung with ID ${updatedBuchung.id} not found`);
        }
        
        // Update the buchung while preserving other fields
        const updatedFields: any = {
            ...buchungenData.data[index]
        };

        // Only update fields that are provided
        if (updatedBuchung.datum !== undefined) updatedFields.datum = updatedBuchung.datum;
        if (updatedBuchung.buchungstext !== undefined) updatedFields.buchungstext = updatedBuchung.buchungstext;
        if (updatedBuchung.betrag !== undefined) updatedFields.betrag = parseFloat(updatedBuchung.betrag);
        if (updatedBuchung.soll !== undefined) updatedFields.soll = parseInt(updatedBuchung.soll);
        if (updatedBuchung.haben !== undefined) updatedFields.haben = parseInt(updatedBuchung.haben);
        if (updatedBuchung.kategorie !== undefined) updatedFields.kategorie = updatedBuchung.kategorie || '';
        if (updatedBuchung.bereich !== undefined) updatedFields.bereich = updatedBuchung.bereich || '';
        
        // Handle subsoll/subhaben fields
        if (updatedBuchung.subsoll !== undefined) {
            updatedFields.subsoll = updatedBuchung.subsoll ? parseInt(updatedBuchung.subsoll) : undefined;
        }
        if (updatedBuchung.subhaben !== undefined) {
            updatedFields.subhaben = updatedBuchung.subhaben ? parseInt(updatedBuchung.subhaben) : undefined;
        }

        buchungenData.data[index] = updatedFields;
        
        // Write back to file
        writeFileSync(BUCHUNGEN_FILE_PATH, JSON.stringify(buchungenData, null, 2));
        
        return json({ success: true, buchung: buchungenData.data[index] });
        
    } catch (err) {
        console.error('Error updating buchung:', err);
        throw error(500, 'Failed to update buchung');
    }
};

export const POST: RequestHandler = async ({ request }) => {
    try {
        const newBuchung = await request.json();
        
        const BUCHUNGEN_FILE_PATH = resolve('data/buchungen.json');
        
        // Read current data
        const fileContent = readFileSync(BUCHUNGEN_FILE_PATH, 'utf-8');
        const buchungenData = JSON.parse(fileContent);
        
        // Add the new buchung to the data array
        buchungenData.data.push(newBuchung);
        
        // Write back to file
        writeFileSync(BUCHUNGEN_FILE_PATH, JSON.stringify(buchungenData, null, 2));
        
        return json({ success: true, buchung: newBuchung });
        
    } catch (err) {
        console.error('Error creating buchung:', err);
        throw error(500, 'Failed to create buchung');
    }
};

export const GET: RequestHandler = async () => {
    try {
        const BUCHUNGEN_FILE_PATH = resolve('data/buchungen.json');
        const fileContent = readFileSync(BUCHUNGEN_FILE_PATH, 'utf-8');
        const buchungenData = JSON.parse(fileContent);
        
        return json({
            success: true,
            data: buchungenData.data || buchungenData
        });
    } catch (err) {
        console.error('Error loading buchungen:', err);
        throw error(500, 'Failed to load buchungen data');
    }
};