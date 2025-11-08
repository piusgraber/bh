import { json } from '@sveltejs/kit';
import { S3Client, ListObjectsV2Command, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

// AWS S3 Configuration using SvelteKit environment variables
const accessKeyId = env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const region = env.AWS_REGION || process.env.AWS_REGION || 'eu-west-1';
const bucketName = env.AWS_BUCKET_NAME || process.env.AWS_BUCKET_NAME || 'bucket-hergol';

// Validate credentials
if (!accessKeyId || !secretAccessKey) {
    console.error('Missing AWS credentials! Check your .env.local file');
    throw new Error('AWS credentials not configured');
}

// Initialize S3 client
const s3Client = new S3Client({
    region: region,
    credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey
    }
});

export const GET: RequestHandler = async () => {
    try {
        // List all objects in the bucket
        const listCommand = new ListObjectsV2Command({
            Bucket: bucketName,
            MaxKeys: 1000 // Adjust as needed
        });

        const response = await s3Client.send(listCommand);
        
        if (!response.Contents) {
            return json({ 
                success: true, 
                data: { files: [] },
                message: 'No files found in bucket'
            });
        }

        // Transform S3 objects to match the expected format with signed URLs
        const files = await Promise.all(
            response.Contents
                .filter(obj => obj.Key && obj.Size && obj.Size > 0) // Filter out folders and empty objects
                .map(async obj => {
                    // Generate signed URL for viewing
                    const getCommand = new GetObjectCommand({
                        Bucket: bucketName,
                        Key: obj.Key
                    });
                    const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
                    
                    return {
                        key: obj.Key,
                        fileName: obj.Key!.split('/').pop() || obj.Key, // Extract filename from path
                        size: obj.Size,
                        lastModified: obj.LastModified?.toISOString() || new Date().toISOString(),
                        fileType: getFileType(obj.Key!),
                        url: `https://${bucketName}.s3.eu-west-1.amazonaws.com/${obj.Key}`,
                        signedUrl: signedUrl
                    };
                })
        );

        return json({ 
            success: true, 
            data: { files },
            message: `Found ${files.length} documents`
        });

    } catch (error) {
        console.error('Error fetching documents from S3:', error);
        return json({ 
            success: false, 
            error: 'Failed to fetch documents',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
};

// PUT endpoint to move a document to irrelevant folder
export const PUT: RequestHandler = async ({ request }) => {
    try {
        const { key, action } = await request.json();

        if (action === 'move-to-irrelevant') {
            // Extract filename from current key
            const fileName = key.split('/').pop();
            const newKey = `irrelevant/${fileName}`;

            // Copy object to new location
            // URL encode the source key to handle special characters like umlauts
            const encodedSourceKey = encodeURIComponent(key);
            const copyCommand = new CopyObjectCommand({
                Bucket: bucketName,
                CopySource: `${bucketName}/${encodedSourceKey}`,
                Key: newKey
            });
            await s3Client.send(copyCommand);

            // Delete original object
            const deleteCommand = new DeleteObjectCommand({
                Bucket: bucketName,
                Key: key
            });
            await s3Client.send(deleteCommand);

            // Add to irrelevant-docs.json by directly importing and calling
            try {
                const { readFileSync, writeFileSync } = await import('fs');
                const { resolve } = await import('path');
                
                const IRRELEVANT_DOCS_FILE = resolve('data/irrelevant-docs.json');
                const fileContent = readFileSync(IRRELEVANT_DOCS_FILE, 'utf-8');
                const data = JSON.parse(fileContent);
                
                if (!data.data) {
                    data.data = [];
                }
                
                // Check if document already exists
                const existingIndex = data.data.findIndex((doc: any) => doc.docname === fileName);
                
                if (existingIndex === -1) {
                    // Generate ID
                    const maxId = data.data.length > 0 ? Math.max(...data.data.map((doc: any) => doc.id || 0)) : 0;
                    
                    // Add new document
                    data.data.push({
                        id: maxId + 1,
                        docname: fileName,
                        partner: '',
                        datum: '',
                        betrag: null
                    });
                    
                    writeFileSync(IRRELEVANT_DOCS_FILE, JSON.stringify(data, null, 2));
                    console.log(`Added ${fileName} to irrelevant-docs.json`);
                }
            } catch (err) {
                console.error('Error adding to irrelevant-docs.json:', err);
                // Continue anyway - document was moved successfully
            }

            return json({
                success: true,
                message: `Document moved to irrelevant folder`,
                newKey: newKey
            });
        }

        return json({
            success: false,
            error: 'Invalid action'
        }, { status: 400 });

    } catch (error) {
        console.error('Error moving document:', error);
        return json({
            success: false,
            error: 'Failed to move document',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
};

function getFileType(key: string): string {
    const extension = key.split('.').pop()?.toLowerCase() || '';
    const typeMap: Record<string, string> = {
        'pdf': 'application/pdf',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
    return typeMap[extension] || 'application/octet-stream';
}