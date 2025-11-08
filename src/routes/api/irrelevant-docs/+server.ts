import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { env } from '$env/dynamic/private';

const IRRELEVANT_DOCS_FILE = resolve('data/irrelevant-docs.json');

// AWS S3 Configuration
const accessKeyId = env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const region = env.AWS_REGION || process.env.AWS_REGION || 'eu-west-1';
const bucketName = env.AWS_BUCKET_NAME || process.env.AWS_BUCKET_NAME || 'bucket-hergol';

const s3Client = new S3Client({
    region: region,
    credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!
    }
});

// Helper function to generate unique ID
function generateId(existingData: any[]): number {
    if (existingData.length === 0) return 1;
    const maxId = Math.max(...existingData.map((doc: any) => doc.id || 0));
    return maxId + 1;
}

// Helper function to sync with S3
async function syncWithS3(data: any) {
    try {
        // List all files in irrelevant/ folder
        const listCommand = new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: 'irrelevant/'
        });
        
        const s3Response = await s3Client.send(listCommand);
        const s3Files = s3Response.Contents?.map(obj => obj.Key?.replace('irrelevant/', '')) || [];
        
        // Get current docnames from JSON (excluding null entries)
        const jsonDocnames = new Set(data.data.filter((doc: any) => doc.docname).map((doc: any) => doc.docname));
        
        // Add missing files from S3 to JSON
        let added = 0;
        for (const fileName of s3Files) {
            if (fileName && !jsonDocnames.has(fileName)) {
                data.data.push({
                    id: generateId(data.data),
                    docname: fileName,
                    partner: '',
                    datum: '',
                    betrag: null
                });
                added++;
            }
        }
        
        // Mark entries as null if file doesn't exist in S3
        const s3FilesSet = new Set(s3Files);
        let removed = 0;
        data.data = data.data.map((doc: any) => {
            if (doc.docname && !s3FilesSet.has(doc.docname)) {
                removed++;
                return {
                    ...doc,
                    docname: null
                };
            }
            return doc;
        });
        
        console.log(`Sync completed: ${added} added, ${removed} marked as deleted`);
        return { added, removed };
        
    } catch (err) {
        console.error('Error syncing with S3:', err);
        return { added: 0, removed: 0 };
    }
}

// GET - Load all irrelevant docs and sync with S3
export const GET: RequestHandler = async ({ url }) => {
    try {
        const fileContent = readFileSync(IRRELEVANT_DOCS_FILE, 'utf-8');
        const data = JSON.parse(fileContent);
        
        // Check if sync is requested
        const shouldSync = url.searchParams.get('sync') === 'true';
        
        if (shouldSync) {
            const syncResult = await syncWithS3(data);
            
            // Write back to file if changes were made
            if (syncResult.added > 0 || syncResult.removed > 0) {
                writeFileSync(IRRELEVANT_DOCS_FILE, JSON.stringify(data, null, 2));
            }
            
            return json({
                success: true,
                data: data.data.filter((doc: any) => doc.docname !== null) || [],
                synced: true,
                syncResult
            });
        }
        
        return json({
            success: true,
            data: data.data.filter((doc: any) => doc.docname !== null) || []
        });
    } catch (err) {
        console.error('Error loading irrelevant docs:', err);
        return json({
            success: true,
            data: []
        });
    }
};

// POST - Add or update irrelevant doc
export const POST: RequestHandler = async ({ request }) => {
    try {
        const docData = await request.json();
        
        // Validate required fields
        if (!docData.docname) {
            throw error(400, 'Document name is required');
        }
        
        const fileContent = readFileSync(IRRELEVANT_DOCS_FILE, 'utf-8');
        const data = JSON.parse(fileContent);
        
        if (!data.data) {
            data.data = [];
        }
        
        // Check if document already exists (by docname)
        const existingIndex = data.data.findIndex((doc: any) => doc.docname === docData.docname);
        
        if (existingIndex !== -1) {
            // Update existing document (preserve ID)
            data.data[existingIndex] = {
                id: data.data[existingIndex].id,
                ...data.data[existingIndex],
                ...docData
            };
        } else {
            // Add new document with ID
            const newDoc = {
                id: generateId(data.data),
                docname: docData.docname,
                partner: docData.partner || '',
                datum: docData.datum || '',
                betrag: docData.betrag || null
            };
            data.data.push(newDoc);
        }
        
        // Write back to file
        writeFileSync(IRRELEVANT_DOCS_FILE, JSON.stringify(data, null, 2));
        
        return json({
            success: true,
            message: existingIndex !== -1 ? 'Document updated' : 'Document added',
            data: existingIndex !== -1 ? data.data[existingIndex] : data.data[data.data.length - 1]
        });
        
    } catch (err: any) {
        console.error('Error saving irrelevant doc:', err);
        throw error(500, `Failed to save irrelevant doc: ${err.message}`);
    }
};

// PUT - Update irrelevant doc
export const PUT: RequestHandler = async ({ request }) => {
    try {
        const docData = await request.json();
        
        if (!docData.docname) {
            throw error(400, 'Document name is required');
        }
        
        const fileContent = readFileSync(IRRELEVANT_DOCS_FILE, 'utf-8');
        const data = JSON.parse(fileContent);
        
        if (!data.data) {
            data.data = [];
        }
        
        // Find and update the document
        const existingIndex = data.data.findIndex((doc: any) => doc.docname === docData.docname);
        
        if (existingIndex !== -1) {
            data.data[existingIndex] = {
                ...data.data[existingIndex],
                ...docData
            };
        } else {
            // If not found, add it
            data.data.push(docData);
        }
        
        // Write back to file
        writeFileSync(IRRELEVANT_DOCS_FILE, JSON.stringify(data, null, 2));
        
        return json({
            success: true,
            message: 'Document updated',
            data: data.data[existingIndex] || docData
        });
        
    } catch (err: any) {
        console.error('Error updating irrelevant doc:', err);
        throw error(500, `Failed to update irrelevant doc: ${err.message}`);
    }
};

// DELETE - Clean up null entries
export const DELETE: RequestHandler = async () => {
    try {
        const fileContent = readFileSync(IRRELEVANT_DOCS_FILE, 'utf-8');
        const data = JSON.parse(fileContent);
        
        if (!data.data) {
            data.data = [];
        }
        
        const beforeCount = data.data.length;
        
        // Remove entries with null docname
        data.data = data.data.filter((doc: any) => doc.docname !== null && doc.docname !== '');
        
        const afterCount = data.data.length;
        const removedCount = beforeCount - afterCount;
        
        // Write back to file
        writeFileSync(IRRELEVANT_DOCS_FILE, JSON.stringify(data, null, 2));
        
        return json({
            success: true,
            message: `Cleaned up ${removedCount} null entries`,
            removedCount
        });
        
    } catch (err: any) {
        console.error('Error cleaning up irrelevant docs:', err);
        throw error(500, `Failed to clean up irrelevant docs: ${err.message}`);
    }
};
