import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
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
const FOLDER_PREFIX = 'buchungen/'; // Folder structure in S3

export const POST: RequestHandler = async ({ request }) => {
	try {
		console.log('[DEBUG] POST request received');
		// Check content type to determine if this is a file upload or document assignment
		const contentType = request.headers.get('content-type');
		console.log('[DEBUG] Content type:', contentType);
		
		if (contentType?.includes('application/json')) {
			// Handle document assignment
			const body = await request.json();
			console.log('[DEBUG] JSON body received:', body);
			const { action, fileKey, buchungId, fileName } = body;
			
			if (action === 'assign') {
				console.log('[DEBUG] Processing assignment action');
				return await handleDocumentAssignment(fileKey, buchungId, fileName);
			}
			
			throw error(400, 'Unknown action');
		}
		
		// Handle file upload (existing logic)
		const formData = await request.formData();
		const file = formData.get('file') as File;
		const buchungId = formData.get('buchungId') as string;

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

		// Check if file with same name already exists in this booking folder
		const folderPrefix = `${FOLDER_PREFIX}buchung-${buchungId}/`;
		const listCommand = new ListObjectsV2Command({
			Bucket: BUCKET_NAME,
			Prefix: folderPrefix
		});

		const existingFiles = await s3Client.send(listCommand);
		if (existingFiles.Contents) {
			const existingNames = existingFiles.Contents
				.map(obj => obj.Key?.split('/').pop()?.replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-/, '') || '')
				.filter(name => name === sanitizedFileName);
			
			if (existingNames.length > 0) {
				console.log(`File "${sanitizedFileName}" already exists in booking ${buchungId}, skipping upload`);
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
		const s3Key = `${FOLDER_PREFIX}buchung-${buchungId}/${timestamp}-${sanitizedFileName}`;

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
				'buchung-id': buchungId,
				'upload-timestamp': new Date().toISOString()
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
				buchungId: buchungId,
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
		const buchungId = url.searchParams.get('buchungId');
		
		if (!buchungId) {
			throw error(400, 'buchungId parameter is required');
		}

		// List objects in docs/ folder with the buchung ID prefix
		const listCommand = new ListObjectsV2Command({
			Bucket: BUCKET_NAME,
			Prefix: `docs/${buchungId}_`
		});

		const listResult = await s3Client.send(listCommand);
		
		if (!listResult.Contents || listResult.Contents.length === 0) {
			return json({
				success: true,
				message: 'No files found for this buchung',
				data: {
					files: [],
					buchungId: buchungId
				}
			});
		}

		// Generate signed URLs for each file
		const files = await Promise.all(
			listResult.Contents.map(async (object) => {
				if (!object.Key) return null;

				// Generate signed URL for viewing (expires in 1 hour)
				const getCommand = new GetObjectCommand({
					Bucket: BUCKET_NAME,
					Key: object.Key
				});

				const signedUrl = await getSignedUrl(s3Client, getCommand, { 
					expiresIn: 3600 // 1 hour
				});

				// Extract original filename from the key (docs/<id>_filename format)
				const keyParts = object.Key.split('/');
				const fileNameWithId = keyParts[keyParts.length - 1]; // e.g., "4438_Wagner_20240612_95.50.pdf"
				const originalName = fileNameWithId.substring(fileNameWithId.indexOf('_') + 1); // Remove "<id>_" prefix

				return {
					key: object.Key,
					fileName: originalName,
					size: object.Size || 0,
					lastModified: object.LastModified,
					signedUrl: signedUrl,
					fileType: getFileTypeFromName(originalName)
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
				files: validFiles,
				buchungId: buchungId
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
			throw err;
		}

		throw error(500, `Failed to list files: ${err.message}`);
	}
};

// Helper function to determine file type from filename
function getFileTypeFromName(fileName: string): string {
	const extension = fileName.toLowerCase().split('.').pop();
	
	switch (extension) {
		case 'pdf':
			return 'application/pdf';
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		case 'png':
			return 'image/png';
		case 'gif':
			return 'image/gif';
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

export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const { fileKey, buchungId } = await request.json();
		
		if (!fileKey) {
			throw error(400, 'File key is required');
		}

		// Check if this is an assigned document (docs/<id>_xxx format)
		const isAssignedDocument = fileKey.startsWith('docs/') && buchungId;
		
		if (isAssignedDocument) {
			// Move back from docs/<id>_xxx to uldocs/xxx
			console.log(`Unassigning document: moving ${fileKey} back to uldocs/`);
			
			// Extract the original filename (remove the <id>_ prefix)
			const fileKeyParts = fileKey.split('/');
			const fileNameWithId = fileKeyParts[fileKeyParts.length - 1]; // e.g., "4438_Wagner_20240612_95.50.pdf"
			const originalFileName = fileNameWithId.substring(fileNameWithId.indexOf('_') + 1); // Remove "<id>_" prefix
			const restoredKey = `uldocs/${originalFileName}`;
			
			// Copy back to uldocs/ - URL encode source path for special characters
			const encodedFileKey = encodeURIComponent(fileKey);
			const copyCommand = new CopyObjectCommand({
				Bucket: BUCKET_NAME,
				CopySource: `${BUCKET_NAME}/${encodedFileKey}`,
				Key: restoredKey
			});
			await s3Client.send(copyCommand);
			
			// Delete from docs/
			const deleteCommand = new DeleteObjectCommand({
				Bucket: BUCKET_NAME,
				Key: fileKey
			});
			await s3Client.send(deleteCommand);
			
			console.log(`Document moved back from ${fileKey} to ${restoredKey}`);
		} else {
			// Regular delete (not an assigned document)
			const deleteCommand = new DeleteObjectCommand({
				Bucket: BUCKET_NAME,
				Key: fileKey
			});
			await s3Client.send(deleteCommand);
		}

		// If this was an assigned document, remove it from buchungen.json
		if (isAssignedDocument) {
			try {
				const fs = await import('fs/promises');
				const path = await import('path');
				
				const BUCHUNGEN_FILE_PATH = path.join(process.cwd(), 'data', 'buchungen.json');
				
				// Read current buchungen data
				const fileContent = await fs.readFile(BUCHUNGEN_FILE_PATH, 'utf-8');
				const buchungenData = JSON.parse(fileContent);
				
				// Find the buchung to update
				const buchungIndex = buchungenData.data.findIndex((b: any) => b.id === parseInt(buchungId));
				
				if (buchungIndex !== -1 && buchungenData.data[buchungIndex].assignedDocuments) {
					// Remove the document from assignedDocuments array
					const originalLength = buchungenData.data[buchungIndex].assignedDocuments.length;
					buchungenData.data[buchungIndex].assignedDocuments = buchungenData.data[buchungIndex].assignedDocuments.filter(
						(doc: any) => doc.newKey !== fileKey && doc.originalKey !== fileKey
					);
					
					const newLength = buchungenData.data[buchungIndex].assignedDocuments.length;
					
					// If array is now empty, remove it
					if (buchungenData.data[buchungIndex].assignedDocuments.length === 0) {
						delete buchungenData.data[buchungIndex].assignedDocuments;
					}
					
					// Write the updated data back to the file
					await fs.writeFile(BUCHUNGEN_FILE_PATH, JSON.stringify(buchungenData, null, 2));
					console.log(`Removed assignment from buchung ${buchungId}. Documents: ${originalLength} -> ${newLength}`);
				}
			} catch (fileError) {
				console.error('Error updating buchungen.json:', fileError);
				// Don't fail the whole operation if JSON update fails
			}
		}
		
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

// Helper function to handle document assignment
async function handleDocumentAssignment(fileKey: string, buchungId: string, fileName: string) {
	try {
		console.log(`Assigning document: ${fileName} (${fileKey}) to buchung ${buchungId}`);
		
		// Create new key: move from uldocs/xxx or irrelevant/xxx to docs/<id>_xxx
		// Extract filename from the original key (remove uldocs/ or irrelevant/ prefix)
		const originalFileName = fileKey.replace(/^(uldocs|irrelevant)\//, '');
		const newKey = `docs/${buchungId}_${originalFileName}`;
		
		// Move the document (copy then delete original)
		// URL encode paths to handle special characters like umlauts
		const encodedFileKey = encodeURIComponent(fileKey);
		const copyCommand = new CopyObjectCommand({
			Bucket: BUCKET_NAME,
			CopySource: `${BUCKET_NAME}/${encodedFileKey}`,
			Key: newKey // S3 keys are automatically URL encoded by AWS SDK
		});

		console.log(`Moving document from ${fileKey} to ${newKey}`);
		await s3Client.send(copyCommand);
		
		// Delete the original file from uldocs/
		const deleteCommand = new DeleteObjectCommand({
			Bucket: BUCKET_NAME,
			Key: fileKey
		});
		await s3Client.send(deleteCommand);
		
		console.log(`Document moved successfully to: ${newKey}`);
		
		// Also update the buchungen.json with the assignment information
		const assignmentData = {
			originalKey: fileKey,
			newKey: newKey,
			fileName: fileName,
			assignedAt: new Date().toISOString(),
			fileType: getFileTypeFromName(fileName),
			size: 0 // We don't have size info here, will be updated if needed
		};

		// Update buchungen.json directly instead of making a fetch call
		try {
			const fs = await import('fs/promises');
			const path = await import('path');
			
			const BUCHUNGEN_FILE_PATH = path.join(process.cwd(), 'data', 'buchungen.json');
			
			// Read current buchungen data
			const fileContent = await fs.readFile(BUCHUNGEN_FILE_PATH, 'utf-8');
			const buchungenData = JSON.parse(fileContent);
			
			// Find the buchung to update
			const buchungIndex = buchungenData.data.findIndex((b: any) => b.id === parseInt(buchungId));
			
			if (buchungIndex !== -1) {
				// Initialize assignedDocuments array if it doesn't exist
				if (!buchungenData.data[buchungIndex].assignedDocuments) {
					buchungenData.data[buchungIndex].assignedDocuments = [];
				}
				
				// Check if document is already assigned
				const existingDoc = buchungenData.data[buchungIndex].assignedDocuments.find(
					(doc: any) => doc.originalKey === assignmentData.originalKey
				);
				
				if (!existingDoc) {
					// Add the document assignment
					buchungenData.data[buchungIndex].assignedDocuments.push(assignmentData);
					
					// Write the updated data back to the file
					await fs.writeFile(BUCHUNGEN_FILE_PATH, JSON.stringify(buchungenData, null, 2));
					console.log(`[DEBUG] Successfully updated buchungen.json with assignment for buchung ${buchungId}`);
				} else {
					console.log('Document already assigned to this buchung');
				}
			} else {
				console.error(`Buchung with ID ${buchungId} not found`);
			}
		} catch (fileError) {
			console.error('Error updating buchungen.json:', fileError);
			// Don't fail the whole operation
		}
		
		return json({
			success: true,
			message: 'Document assigned successfully',
			data: assignmentData
		});
		
	} catch (err: any) {
		console.error('[DEBUG] Assignment error:', err);
		console.error('[DEBUG] Error details:', {
			name: err.name,
			message: err.message,
			code: err.code,
			stack: err.stack
		});
		throw error(500, `Assignment failed: ${err.message}`);
	}
}