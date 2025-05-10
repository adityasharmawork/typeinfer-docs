// src/parsers/csv.ts
import * as fs from 'fs';
import csvParser from 'csv-parser';
import { inferSchema } from '../utils/inferSchema'; // Adjusted path if utils is in src
import { SchemaType } from '../utils/inferSchema'; // Assuming SchemaType is exported

// Function to attempt to convert string values to their appropriate types
function convertCsvValues(data: Record<string, string>): Record<string, any> {
  const converted: Record<string, any> = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const value = data[key];
      // Try to convert to number if it's a numeric string and not empty
      if (value !== null && value.trim() !== '' && !isNaN(Number(value))) {
        converted[key] = Number(value);
      } else if (value && value.toLowerCase() === 'true') {
        converted[key] = true;
      } else if (value && value.toLowerCase() === 'false') {
        converted[key] = false;
      } else {
        converted[key] = value;
      }
    }
  }
  return converted;
}

export function parseCsvFile(filePath: string): Promise<SchemaType> {
  return new Promise((resolve, reject) => {
    const results: any[] = [];
    
    const stream = fs.createReadStream(filePath);

    stream.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return reject(new Error(`Failed to open CSV file: File not found at ${filePath}`));
      }
      return reject(new Error(`Failed to read CSV file: ${error.message}`));
    });

    stream
      .pipe(csvParser())
      .on('data', (data: Record<string, string>) => {
        results.push(convertCsvValues(data));
      })
      .on('end', () => {
        if (results.length === 0) {
          // It's possible a CSV file has headers but no data rows.
          // Depending on desired behavior, this might not be an error,
          // or it might infer from headers if that logic were added.
          // For now, treating as potentially empty or header-only.
          return reject(new Error('CSV file is empty or contains only headers. Cannot infer schema.'));
        }
        try {
          const schema = inferSchema(results);
          resolve(schema);
        } catch (inferenceError: any) {
          reject(new Error(`Error inferring schema from CSV data: ${inferenceError.message}`));
        }
      })
      .on('error', (error: Error) => {
        // This error is for the csvParser itself
        reject(new Error(`Failed to parse CSV content: ${error.message}`));
      });
  });
}