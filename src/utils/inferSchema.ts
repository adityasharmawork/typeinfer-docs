export interface SchemaType {
  type: string;
  properties?: Record<string, SchemaType>;
  items?: SchemaType;
  format?: string;
  required?: string[];
  enum?: SchemaType[]; // Changed from any[] to SchemaType[] for consistency if enums are schemas
}

/**
 * Infers a schema from a data sample
 * @param data The data to infer a schema from
 * @returns An inferred schema object
 */
export function inferSchema(data: any): SchemaType {
  if (data === null || data === undefined) {
    return { type: 'null' };
  }
  
  // Handle arrays
  if (Array.isArray(data)) {
    if (data.length === 0) {
      // For an empty array, we can't infer item type, default to 'any' or 'unknown'
      // or a more specific configurable type.
      return { type: 'array', items: { type: 'any' } as SchemaType }; // Use a placeholder like 'any'
    }
    // If all items are of the same primitive type, could optimize.
    // For now, merge schemas of all items for robustness with heterogeneous arrays.
    const itemSchemas = data.map(item => inferSchema(item));
    return { type: 'array', items: mergeSchemas(itemSchemas) };
  }
  
  // Handle objects
  if (typeof data === 'object' && data !== null) { // Ensure not null, as typeof null is 'object'
    const properties: Record<string, SchemaType> = {};
    const required: string[] = []; // Properties that are present and not undefined
    
    for (const [key, value] of Object.entries(data)) {
      properties[key] = inferSchema(value);
      // A property is considered "present" for 'required' if its value is not undefined.
      // null is a valid JSON value, so a key with a null value is still "present".
      if (value !== undefined) { 
        required.push(key);
      }
    }
    
    return { type: 'object', properties, required: required.length > 0 ? required : undefined };
  }
  
  // Handle primitives
  return inferPrimitiveSchema(data);
}

/**
 * Infers schema for primitive values with special format detection
 * @param value A primitive value
 * @returns A schema representing the primitive type
 */
function inferPrimitiveSchema(value: any): SchemaType {
  const type = typeof value;
  
  // Handle special string formats
  if (type === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value)) {
      return { type: 'string', format: 'date-time' };
    }
    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) {
      return { type: 'string', format: 'email' };
    }
    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value)) {
      return { type: 'string', format: 'uuid' };
    }
    return { type: 'string' };
  }
  
  // Handle numeric types more precisely
  if (type === 'number') {
    if (Number.isInteger(value)) {
      return { type: 'integer' };
    }
    return { type: 'number' };
  }

  if (type === 'boolean') {
      return { type: 'boolean' };
  }
  
  // For any other types (e.g. 'function', 'symbol', 'bigint' if not handled)
  // return a generic type or handle as an error depending on requirements.
  // For now, returning based on `typeof`.
  return { type };
}

/**
 * Merges multiple schemas into a single schema
 * @param schemas The schemas to merge
 * @returns A merged schema
 */

function mergeSchemas(schemas: SchemaType[]): SchemaType {
  if (schemas.length === 0) {
    return { type: 'any' } as SchemaType; // Fallback for empty array of schemas
  }
  
  if (schemas.length === 1) {
    return schemas[0];
  }
  
  // Check if all schemas are effectively the same (e.g. array of all strings)
  // This is a simplified check; deep equality would be more robust.
  const firstSchemaType = JSON.stringify(schemas[0]); // Simple comparison
  const allEffectivelySame = schemas.every(schema => JSON.stringify(schema) === firstSchemaType);

  if (allEffectivelySame) {
      return schemas[0];
  }

  // If types are different, create a union type
  // Filter out 'any' types if other more specific types are present in the union,
  // unless 'any' is the only type.
  const uniqueSchemaStrings = new Set<string>();
  const uniqueSchemas: SchemaType[] = [];

  schemas.forEach(s => {
      const sString = JSON.stringify(s); // Simple way to get a unique key
      if (!uniqueSchemaStrings.has(sString)) {
          uniqueSchemaStrings.add(sString);
          uniqueSchemas.push(s);
      }
  });
  
  // If, after deduplication, there's only one schema type, return that.
  if (uniqueSchemas.length === 1) {
      return uniqueSchemas[0];
  }

  // If 'any' is one of the types in a union with other specific types, 'any' often "wins"
  // or makes the union less useful. Depending on desired behavior, 'any' could be filtered
  // if other types exist. For now, include all unique schemas in the union.
  return { type: 'union', enum: uniqueSchemas };
}