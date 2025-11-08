import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '$env/dynamic/private';

// AWS S3 Configuration using SvelteKit environment variables
const accessKeyId = env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const region = env.AWS_REGION || process.env.AWS_REGION || 'eu-west-1';
const bucketName = env.AWS_BUCKET_NAME || process.env.AWS_BUCKET_NAME || 'bucket-hergol';

// Debug environment variables
console.log('Environment check:', {
	hasAccessKey: !!accessKeyId,
	hasSecretKey: !!secretAccessKey,
	region: region,
	bucket: bucketName,
	accessKeyStart: accessKeyId?.substring(0, 4) + '...',
	secretKeyStart: secretAccessKey?.substring(0, 4) + '...'
});

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
const FOLDER_PREFIX = 'uldocs/'; // Folder structure in S3

export const POST: RequestHandler = async ({ request }) => {
	try {
		// Parse form data
		const formData = await request.formData();
		const file = formData.get('file') as File;
		const folder = formData.get('folder') as string;

		// Validate file
		if (!file || file.size === 0) {
			throw error(400, 'No file provided or file is empty');
		}

		// Validate file size (10MB limit)
		const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
		if (file.size > MAX_FILE_SIZE) {
			throw error(400, 'File size exceeds 10MB limit');
		}

		// Validate file type
		const allowedTypes = [
			'image/jpeg',
			'image/png', 
			'image/gif',
			'application/pdf',
			'application/msword',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'application/vnd.ms-excel',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'text/plain'
		];

		if (!allowedTypes.includes(file.type)) {
			throw error(400, 'File type not allowed');
		}

		// Sanitize filename to be S3-compatible but preserve umlauts and Unicode characters
		const sanitizedFileName = file.name
			.replace(/[<>:"/\\|?*]/g, '_')  // Remove only problematic characters for file systems
			.replace(/\s+/g, ' ')          // Normalize multiple spaces to single space
			.trim();                       // Remove leading/trailing spaces

		// Check if file with same name already exists in docs folder
		const listCommand = new ListObjectsV2Command({
			Bucket: BUCKET_NAME,
			Prefix: FOLDER_PREFIX
		});

		const existingFiles = await s3Client.send(listCommand);
		if (existingFiles.Contents) {
			const existingNames = existingFiles.Contents
				.map(obj => obj.Key?.split('/').pop()?.replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-/, '') || '')
				.filter(name => name === sanitizedFileName);
			
			if (existingNames.length > 0) {
				console.log(`File "${sanitizedFileName}" already exists in docs, skipping upload`);
				return json({ 
					success: true, 
					message: 'File already exists, skipped',
					url: '', 
					key: '' 
				});
			}
		}

		// Generate unique file name with timestamp
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const s3Key = `${FOLDER_PREFIX}${timestamp}-${sanitizedFileName}`;

		// Convert file to buffer
		const buffer = Buffer.from(await file.arrayBuffer());

		// Upload to S3
		// Encode metadata values to handle Unicode characters properly
		const encodedFileName = Buffer.from(file.name, 'utf8').toString('base64');
		
		const uploadCommand = new PutObjectCommand({
			Bucket: BUCKET_NAME,
			Key: s3Key,
			Body: buffer,
			ContentType: file.type,
			ContentLength: file.size,
			Metadata: {
				'original-name-b64': encodedFileName, // Base64 encoded to handle Unicode
				'original-name': file.name.replace(/[^\x00-\x7F]/g, '?'), // ASCII fallback
				'upload-timestamp': new Date().toISOString(),
				'folder': folder || 'uldocs'
			}
		});

		const uploadResult = await s3Client.send(uploadCommand);

		// Generate S3 URL (adjust based on your S3 configuration)
		const s3Url = `https://${BUCKET_NAME}.s3.amazonaws.com/${s3Key}`;
		
		// Log successful upload
		console.log(`File uploaded successfully: ${s3Key}`);

		return json({
			success: true,
			message: 'File uploaded successfully',
			data: {
				fileName: file.name,
				fileSize: file.size,
				fileType: file.type,
				s3Key: s3Key,
				s3Url: s3Url,
				uploadTimestamp: new Date().toISOString(),
				etag: uploadResult.ETag
			}
		});

	} catch (err: any) {
		console.error('Upload error:', err);
		
		// Handle AWS S3 specific errors
		if (err.name === 'NoSuchBucket') {
			throw error(500, 'S3 bucket not found');
		}
		
		if (err.name === 'AccessDenied') {
			throw error(500, 'S3 access denied - check credentials');
		}

		// Handle other errors
		if (err.status) {
			throw err; // Re-throw SvelteKit errors
		}

		throw error(500, `Upload failed: ${err.message}`);
	}
};

export const GET: RequestHandler = async ({ url }) => {
	try {
		// List objects in the uldocs folder
		const listCommand = new ListObjectsV2Command({
			Bucket: BUCKET_NAME,
			Prefix: FOLDER_PREFIX
		});

		const listResult = await s3Client.send(listCommand);
		
		// Also list objects in the irrelevant folder
		const irrelevantListCommand = new ListObjectsV2Command({
			Bucket: BUCKET_NAME,
			Prefix: 'irrelevant/'
		});

		const irrelevantListResult = await s3Client.send(irrelevantListCommand);
		
		// Combine results from both folders
		const allContents = [
			...(listResult.Contents || []),
			...(irrelevantListResult.Contents || [])
		];
		
		if (allContents.length === 0) {
			return json({
				success: true,
				message: 'No files found',
				data: {
					files: []
				}
			});
		}

		// Generate signed URLs for each file
		const files = await Promise.all(
			allContents.map(async (object) => {
				if (!object.Key) return null;

				// Generate signed URL for viewing (expires in 1 hour)
				const getCommand = new GetObjectCommand({
					Bucket: BUCKET_NAME,
					Key: object.Key
				});

				const signedUrl = await getSignedUrl(s3Client, getCommand, { 
					expiresIn: 3600 // 1 hour
				});

				// Extract original filename from the key
				const keyParts = object.Key.split('/');
				const fileName = keyParts[keyParts.length - 1];
				const originalName = fileName.replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-/, '');
				
				// Check if file is from irrelevant folder
				const isIrrelevant = object.Key.startsWith('irrelevant/');

				return {
					key: object.Key,
					fileName: originalName,
					size: object.Size || 0,
					lastModified: object.LastModified,
					signedUrl: signedUrl,
					fileType: getFileTypeFromName(originalName),
					isIrrelevant: isIrrelevant
				};
			})
		);

		// Filter out null values and sort by last modified
		const validFiles = files
			.filter(file => file !== null)
			.sort((a, b) => {
				const dateA = a?.lastModified ? new Date(a.lastModified).getTime() : 0;
				const dateB = b?.lastModified ? new Date(b.lastModified).getTime() : 0;
				return dateB - dateA;
			});

		return json({
			success: true,
			message: `Found ${validFiles.length} files`,
			data: {
				files: validFiles
			}
		});

	} catch (err: any) {
		console.error('List files error:', err);
		
		if (err.name === 'NoSuchBucket') {
			throw error(500, 'S3 bucket not found');
		}
		
		if (err.name === 'AccessDenied') {
			throw error(500, 'S3 access denied - check credentials');
		}

		if (err.status) {
			throw err; // Re-throw SvelteKit errors
		}

		throw error(500, `List files failed: ${err.message}`);
	}
};

export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const { fileKey } = await request.json();
		
		if (!fileKey) {
			throw error(400, 'File key is required');
		}

		// Delete the object from S3
		const deleteCommand = new DeleteObjectCommand({
			Bucket: BUCKET_NAME,
			Key: fileKey
		});

		await s3Client.send(deleteCommand);
		
		console.log(`File deleted successfully: ${fileKey}`);

		return json({
			success: true,
			message: 'File deleted successfully',
			data: {
				deletedKey: fileKey
			}
		});

	} catch (err: any) {
		console.error('Delete error:', err);
		
		if (err.name === 'NoSuchKey') {
			throw error(404, 'File not found');
		}
		
		if (err.name === 'AccessDenied') {
			throw error(500, 'S3 access denied - check credentials');
		}

		if (err.status) {
			throw err; // Re-throw SvelteKit errors
		}

		throw error(500, `Delete failed: ${err.message}`);
	}
};

// Helper function to determine file type from filename
function getFileTypeFromName(fileName: string) {
	const extension = fileName.split('.').pop()?.toLowerCase();
	
	switch (extension) {
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		case 'png':
			return 'image/png';
		case 'gif':
			return 'image/gif';
		case 'pdf':
			return 'application/pdf';
		case 'doc':
			return 'application/msword';
		case 'docx':
			return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
		case 'xls':
			return 'application/vnd.ms-excel';
		case 'xlsx':
			return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
		case 'txt':
			return 'text/plain';
		default:
			return 'application/octet-stream';
	}
}