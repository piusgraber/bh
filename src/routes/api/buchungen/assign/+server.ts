import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs/promises';
import path from 'path';

const BUCHUNGEN_FILE_PATH = path.join(process.cwd(), 'data', 'buchungen.json');

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { buchungId, documentInfo } = await request.json();
        
        if (!buchungId || !documentInfo) {
            throw error(400, 'buchungId and documentInfo are required');
        }

        // Read the current buchungen data
        const fileContent = await fs.readFile(BUCHUNGEN_FILE_PATH, 'utf-8');
        const buchungenData = JSON.parse(fileContent);
        
        // Find the buchung to update
        const buchungIndex = buchungenData.data.findIndex((b: any) => b.id === parseInt(buchungId));
        
        if (buchungIndex === -1) {
            throw error(404, `Buchung with ID ${buchungId} not found`);
        }

        // Initialize assignedDocuments array if it doesn't exist
        if (!buchungenData.data[buchungIndex].assignedDocuments) {
            buchungenData.data[buchungIndex].assignedDocuments = [];
        }

        // Check if document is already assigned
        const existingDoc = buchungenData.data[buchungIndex].assignedDocuments.find(
            (doc: any) => doc.originalKey === documentInfo.originalKey
        );

        if (existingDoc) {
            return json({
                success: true,
                message: 'Document already assigned',
                data: existingDoc
            });
        }

        // Add the document assignment
        const assignmentInfo = {
            originalKey: documentInfo.originalKey,
            newKey: documentInfo.newKey,
            fileName: documentInfo.fileName,
            assignedAt: documentInfo.assignedAt,
            fileType: documentInfo.fileType || 'unknown',
            size: documentInfo.size || 0
        };

        buchungenData.data[buchungIndex].assignedDocuments.push(assignmentInfo);

        // Write the updated data back to the file
        await fs.writeFile(BUCHUNGEN_FILE_PATH, JSON.stringify(buchungenData, null, 2));

        console.log(`Document assigned to buchung ${buchungId}:`, assignmentInfo);

        return json({
            success: true,
            message: 'Document assignment saved',
            data: {
                buchungId: buchungId,
                assignmentInfo: assignmentInfo,
                totalAssignments: buchungenData.data[buchungIndex].assignedDocuments.length
            }
        });

    } catch (err: any) {
        console.error('Error saving document assignment:', err);
        
        if (err.code === 'ENOENT') {
            throw error(404, 'Buchungen file not found');
        }
        
        if (err.status) {
            throw err; // Re-throw SvelteKit errors
        }

        throw error(500, `Failed to save assignment: ${err.message}`);
    }
};