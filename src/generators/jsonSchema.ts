// src/generators/jsonSchema.ts
import { SchemaType } from '../utils/inferSchema'; // Adjusted path

export interface GenerateOptions {
  inferOptional: boolean;
  prettify: boolean;
  interfaceName?: string; // This is schema "title"
}

export function generateJsonSchema(schema: SchemaType, options: GenerateOptions): string {
  const output = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: options.interfaceName || 'GeneratedSchema',
    ...generateJsonSchemaFromSchema(schema, options) // Pass full schema
  };
  
  return options.prettify ? JSON.stringify(output, null, 2) : JSON.stringify(output);
}

function generateJsonSchemaFromSchema(schemaNode: SchemaType, options: GenerateOptions): any {
  if (!schemaNode) return { type: 'null' }; // Should ideally not happen with SchemaType
  
  let jsonSchemaNode: any = {};

  switch (schemaNode.type) {
    case 'null':
      jsonSchemaNode.type = 'null';
      break;
    case 'string':
      jsonSchemaNode.type = 'string';
      if (schemaNode.format) jsonSchemaNode.format = schemaNode.format;
      break;
    case 'number':
      jsonSchemaNode.type = 'number';
      break;
    case 'integer':
      jsonSchemaNode.type = 'integer'; // JSON Schema supports 'integer'
      break;
    case 'boolean':
      jsonSchemaNode.type = 'boolean';
      break;
    case 'array':
      jsonSchemaNode.type = 'array';
      if (schemaNode.items) {
        jsonSchemaNode.items = generateJsonSchemaFromSchema(schemaNode.items, options);
      } else {
        jsonSchemaNode.items = {}; // Represents an array of anything
      }
      break;
    case 'object':
      jsonSchemaNode.type = 'object';
      jsonSchemaNode.properties = {};
      if (schemaNode.properties) {
        for (const [key, value] of Object.entries(schemaNode.properties)) {
          jsonSchemaNode.properties[key] = generateJsonSchemaFromSchema(value, options);
        }
      }
      // Handle 'required' properties based on inferOptional and what's in schemaNode.required
      if (options.inferOptional) {
        // If inferring optional, only explicitly 'required' fields from schemaNode are required in output.
        // Custom fields are not added to schemaNode.required, so they'll be optional.
        if (schemaNode.required && schemaNode.required.length > 0) {
          jsonSchemaNode.required = schemaNode.required;
        }
      } else {
        // If not inferring optional, all fields present in properties are considered required,
        // unless they were originally missing from some objects in the input data (which schemaNode.required would reflect).
        // So, if schemaNode.properties exists, all its keys could be candidates for 'required'.
        // However, respecting the original `required` array from `inferSchema` is probably best.
        // If `inferOptional` is false, it usually means make everything that was consistently present required.
         if (schemaNode.properties) {
             // This makes all keys from the schema properties required if inferOptional is false.
             // This might be too aggressive. A better approach for `!inferOptional` might be
             // to ensure that `schemaNode.required` (from inferSchema) lists all properties
             // that were present in ALL source objects.
             // For now, using the keys of the properties:
             jsonSchemaNode.required = Object.keys(schemaNode.properties);
         }

      }
      // If required array becomes empty, it's conventional to omit it.
      if (jsonSchemaNode.required && jsonSchemaNode.required.length === 0) {
          delete jsonSchemaNode.required;
      }
      break;
    case 'union':
      if (schemaNode.enum && schemaNode.enum.length > 0) {
        // Filter out null/undefined schemas from enum before mapping, if any
        const validEnumSchemas = schemaNode.enum.filter(s => s);
        jsonSchemaNode.anyOf = validEnumSchemas.map((s: SchemaType) => generateJsonSchemaFromSchema(s, options));
        if (jsonSchemaNode.anyOf.length === 0) delete jsonSchemaNode.anyOf; // clean up if empty
      } else {
        // A union without enum might represent 'any', or could be an error in schema inference.
        // Defaulting to an empty object or could specify a more generic type.
        jsonSchemaNode.description = "Union type with no specific variants, effectively 'any'.";
      }
      break;
    default:
      // For 'any' or other unhandled SchemaType types.
      // JSON Schema doesn't have a direct 'any' type like TypeScript.
      // An empty schema object {} often means "any value is allowed".
      // Or you could add a description.
      jsonSchemaNode.description = `Represents type: ${schemaNode.type}`;
      break;
  }
  return jsonSchemaNode;
}