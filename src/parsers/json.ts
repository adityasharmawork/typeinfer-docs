import * as fs from 'fs';
import { inferSchema, SchemaType } from '../utils/inferSchema';

/**
 * Parses a JSON file and generates a schema
 * @param filePath Path to the JSON file
 * @returns Promise resolving to the inferred schema
 */
export function parseJsonFile(filePath: string): Promise<SchemaType> {
  return new Promise((resolve, reject) => {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      resolve(inferSchema(data));
    } catch (error) {
      reject(new Error(`Failed to parse JSON file: ${(error as Error).message}`));
    }
  });
}

/**
 * Parses a JSON string and generates a schema
 * @param jsonString The JSON string to parse
 * @returns The inferred schema
 */
export function parseJsonString(jsonString: string): SchemaType {
  try {
    const data = JSON.parse(jsonString);
    return inferSchema(data);
  } catch (error) {
    throw new Error(`Failed to parse JSON string: ${(error as Error).message}`);
  }
}