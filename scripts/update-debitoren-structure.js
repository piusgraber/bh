import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read buchungen.json
const buchungenPath = path.join(__dirname, '../data/buchungen.json');
const jsonData = JSON.parse(fs.readFileSync(buchungenPath, 'utf8'));
const buchungen = jsonData.data;

console.log(`Total buchungen: ${buchungen.length}`);

// Find buchungen with 11xx accounts (1101-1199)
let updatedCount = 0;

buchungen.forEach(buchung => {
    let updated = false;
    
    // Check Soll
    if (buchung.soll >= 1101 && buchung.soll <= 1199) {
        buchung.subsoll = buchung.soll;
        buchung.soll = 1100;
        updated = true;
        console.log(`Updated Soll: ${buchung.subsoll} -> 1100 (subsoll: ${buchung.subsoll}) for buchung ${buchung.id}`);
    }
    
    // Check Haben
    if (buchung.haben >= 1101 && buchung.haben <= 1199) {
        buchung.subhaben = buchung.haben;
        buchung.haben = 1100;
        updated = true;
        console.log(`Updated Haben: ${buchung.subhaben} -> 1100 (subhaben: ${buchung.subhaben}) for buchung ${buchung.id}`);
    }
    
    if (updated) {
        updatedCount++;
    }
});

console.log(`\nTotal buchungen updated: ${updatedCount}`);

// Write back to file
jsonData.data = buchungen;
fs.writeFileSync(buchungenPath, JSON.stringify(jsonData, null, 2));
console.log('Buchungen updated successfully!');
