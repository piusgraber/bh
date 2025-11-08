import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local file
const envPath = path.resolve(__dirname, '..', '.env.local');
dotenv.config({ path: envPath });

console.log('Loading .env.local from:', envPath);

// Load environment variables
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION || 'eu-west-1';
const bucketName = process.env.AWS_BUCKET_NAME || 'bucket-hergol';

console.log('AWS Config:', {
    hasAccessKey: !!accessKeyId,
    hasSecretKey: !!secretAccessKey,
    region,
    bucketName
});

if (!accessKeyId || !secretAccessKey) {
    console.error('Missing AWS credentials! Check your .env.local file');
    process.exit(1);
}

const s3Client = new S3Client({
    region: region,
    credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey
    }
});

// Function to extract data from filename
function extractDataFromFilename(fileName) {
    // Remove timestamp prefix if present
    const cleanName = fileName.replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-/, '');
    
    // Try to extract partner, date, and amount from filename
    // Expected formats: Partner_YYYYMMDD_amount.ext or Partner_YYYY-MM-DD_amount.ext
    const match = cleanName.match(/^(.+?)_(\d{4}[-]?\d{2}[-]?\d{2})_?([\d.]+)?/);
    
    let partner = '';
    let datum = '';
    let betrag = '';
    
    if (match) {
        partner = match[1] || '';
        let dateStr = match[2] || '';
        // Normalize date format to YYYY-MM-DD
        if (dateStr && !dateStr.includes('-')) {
            datum = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
        } else {
            datum = dateStr;
        }
        betrag = match[3] || '';
    }
    
    return {
        docname: cleanName,
        partner: partner,
        datum: datum,
        betrag: betrag ? parseFloat(betrag) : null
    };
}

async function populateIrrelevantDocs() {
    console.log('Fetching irrelevant documents from S3...');
    
    try {
        // List objects in the irrelevant folder
        const listCommand = new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: 'irrelevant/'
        });
        
        const listResult = await s3Client.send(listCommand);
        
        if (!listResult.Contents || listResult.Contents.length === 0) {
            console.log('No irrelevant documents found in S3');
            return;
        }
        
        console.log(`Found ${listResult.Contents.length} irrelevant documents`);
        
        const irrelevantDocs = [];
        
        for (const object of listResult.Contents) {
            if (!object.Key) continue;
            
            const fileName = object.Key.split('/').pop();
            if (!fileName) continue;
            
            const docData = extractDataFromFilename(fileName);
            irrelevantDocs.push(docData);
            
            console.log(`Processed: ${fileName}`);
        }
        
        // Read existing file if it exists
        const filePath = path.join(__dirname, '../data/irrelevant-docs.json');
        let existingData = { data: [] };
        
        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            existingData = JSON.parse(fileContent);
        }
        
        // Add IDs to existing entries if they don't have them
        let maxId = 0;
        existingData.data = existingData.data.map((doc, index) => {
            if (!doc.id) {
                doc.id = index + 1;
            }
            maxId = Math.max(maxId, doc.id);
            return doc;
        });
        
        // Merge with existing data (keep existing entries, add new ones)
        const existingDocNames = new Set(existingData.data.map(doc => doc.docname));
        
        for (const doc of irrelevantDocs) {
            if (!existingDocNames.has(doc.docname)) {
                maxId++;
                existingData.data.push({
                    id: maxId,
                    ...doc
                });
            }
        }
        
        // Write to file
        fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
        
        console.log(`\nPopulated irrelevant-docs.json with ${irrelevantDocs.length} documents`);
        console.log(`Total documents in file: ${existingData.data.length}`);
        
    } catch (error) {
        console.error('Error populating irrelevant docs:', error);
        process.exit(1);
    }
}

populateIrrelevantDocs();
