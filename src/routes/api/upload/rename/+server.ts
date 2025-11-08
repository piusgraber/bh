import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { S3Client, CopyObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

const s3Client = new S3Client({
	region: region,
	credentials: {
		accessKeyId: accessKeyId,
		secretAccessKey: secretAccessKey
	}
});

const BUCKET_NAME = bucketName;

export const PATCH: RequestHandler = async ({ request }) => {
	try {
		const { oldKey, newFileName } = await request.json();
		
		if (!oldKey || !newFileName) {
			throw error(400, 'Old key and new filename are required');
		}

		// Sanitize filename to be S3-compatible but preserve umlauts and Unicode characters
		const sanitizedFileName = newFileName
			.replace(/[<>:"/\\|?*]/g, '_')  // Remove only problematic characters for file systems
			.replace(/\s+/g, ' ')          // Normalize multiple spaces to single space
			.trim();                       // Remove leading/trailing spaces
		
		// Extract the path from oldKey to maintain folder structure
		const pathParts = oldKey.split('/');
		const oldFileName = pathParts[pathParts.length - 1];
		
		// Get file extension from original file
		const oldExtension = oldFileName.includes('.') ? oldFileName.substring(oldFileName.lastIndexOf('.')) : '';
		
		// Create new key with same path but new filename
		pathParts[pathParts.length - 1] = sanitizedFileName + oldExtension;
		const newKey = pathParts.join('/');

		// Copy object to new location
		const copyCommand = new CopyObjectCommand({
			Bucket: BUCKET_NAME,
			CopySource: encodeURIComponent(`${BUCKET_NAME}/${oldKey}`),
			Key: newKey,
			MetadataDirective: 'COPY'
		});

		await s3Client.send(copyCommand);

		// Delete old object
		const deleteCommand = new DeleteObjectCommand({
			Bucket: BUCKET_NAME,
			Key: oldKey
		});

		await s3Client.send(deleteCommand);

		// Generate new signed URL
		const getCommand = new GetObjectCommand({
			Bucket: BUCKET_NAME,
			Key: newKey
		});

		const signedUrl = await getSignedUrl(s3Client, getCommand, { 
			expiresIn: 3600 // 1 hour
		});

		console.log(`File renamed successfully: ${oldKey} -> ${newKey}`);

		return json({
			success: true,
			message: 'File renamed successfully',
			data: {
				oldKey: oldKey,
				newKey: newKey,
				newFileName: sanitizedFileName + oldExtension,
				signedUrl: signedUrl
			}
		});

	} catch (err: any) {
		console.error('Rename error:', err);
		
		if (err.name === 'NoSuchKey') {
			throw error(404, 'File not found');
		}
		
		if (err.name === 'AccessDenied') {
			throw error(500, 'S3 access denied - check credentials');
		}

		if (err.status) {
			throw err; // Re-throw SvelteKit errors
		}

		throw error(500, `Rename failed: ${err.message}`);
	}
};