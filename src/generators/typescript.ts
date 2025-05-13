import { format } from 'prettier';
import { SchemaType } from '../utils/inferSchema';

export interface GenerateOptions {
  inferOptional: boolean;
  prettify: boolean;
  interfaceName?: string;
}

/**
 * Generates TypeScript interface from a schema
 * @param schema The schema to generate TypeScript from
 * @param options Generation options
 * @returns TypeScript interface as a string
 */

export async function generateTypeScript(schema: SchemaType, options: GenerateOptions): Promise<string> {
  const interfaceName = options.interfaceName || 'GeneratedInterface';
  let output = `interface ${interfaceName} ${generateTypeScriptFromSchema(schema, options)}\n`;
  
  if (options.prettify) {
    try {
      output = await format(output, { parser: 'typescript' });
    } catch (error) {
      console.warn('Failed to prettify output:', (error as Error).message);
    }
  }
  
  return output;
}

/**
 * Generates TypeScript type definitions recursively
 * @param schema The schema to generate from
 * @param options Generation options
 * @param depth Current depth for indentation
 * @returns TypeScript type definition as a string
 */

function generateTypeScriptFromSchema(schema: SchemaType, options: GenerateOptions, depth = 0): string {
  if (!schema) return 'any';
  
  switch (schema.type) {
    case 'null':
      return 'null';
    case 'string':
      if (schema.format === 'date-time') return 'Date';
      if (schema.format === 'email') return 'string'; // Could be more specific with documentation
      if (schema.format === 'uuid') return 'string'; // Could be more specific with documentation
      return 'string';
    case 'number':
      return 'number';
    case 'integer':
      return 'number'; // TypeScript doesn't have a specific integer type
    case 'boolean':
      return 'boolean';
    case 'array':
      const itemType = schema.items ? generateTypeScriptFromSchema(schema.items, options, depth + 1) : 'any';
      return `${itemType}[]`;
    case 'object':
      if (!schema.properties) return 'Record<string, any>';
      
      let output = '{\n';
      const indent = '  '.repeat(depth + 1);
      
      for (const [key, value] of Object.entries(schema.properties)) {
        const isRequired = schema.required?.includes(key);
        const optionalMarker = (!isRequired && options.inferOptional) ? '?' : '';
        
        output += `${indent}${key}${optionalMarker}: ${generateTypeScriptFromSchema(value, options, depth + 1)};\n`;
      }
      
      output += '  '.repeat(depth) + '}';
      return output;
    case 'union':
      if (schema.enum) {
        return schema.enum.map((s: any) => generateTypeScriptFromSchema(s, options, depth)).join(' | ');
      }
      return 'any';
    default:
      return 'any';
  }
}