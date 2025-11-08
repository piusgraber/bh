import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the buchungen.json file
const buchungenPath = path.join(__dirname, '..', 'data', 'buchungen.json');
const data = JSON.parse(fs.readFileSync(buchungenPath, 'utf-8'));

let updatedCount = 0;

// Update each buchung
data.data = data.data.map(buchung => {
    let updated = false;
    const newBuchung = { ...buchung };

    // Check if soll is 20xx (but not 2000 and in range 2001-2099)
    if (buchung.soll >= 2001 && buchung.soll <= 2099) {
        newBuchung.subsoll = buchung.soll;
        newBuchung.soll = 2000;
        updated = true;
    }

    // Check if haben is 20xx (but not 2000 and in range 2001-2099)
    if (buchung.haben >= 2001 && buchung.haben <= 2099) {
        newBuchung.subhaben = buchung.haben;
        newBuchung.haben = 2000;
        updated = true;
    }

    if (updated) {
        updatedCount++;
    }

    return newBuchung;
});

// Write back to file
fs.writeFileSync(buchungenPath, JSON.stringify(data, null, 2), 'utf-8');

console.log(`Updated ${updatedCount} buchungen`);
console.log('Buchungen.json has been updated with subsoll/subhaben structure');
