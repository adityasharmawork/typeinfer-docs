#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';

// Parsers & Generators
import { parseJsonFile, parseJsonString } from './parsers/json';
import { parseApiResponse } from './parsers/api';
import { parseCsvFile } from './parsers/csv';
import { generateTypeScript, GenerateOptions as TSGenerateOptions } from './generators/typescript';
import { generateJsonSchema, GenerateOptions as JsonSchemaGenerateOptions } from './generators/jsonSchema';
import { SchemaType } from './utils/inferSchema';
import { createSpinner } from "nanospinner";

const spinner = createSpinner('Generating output...');

interface CustomField {
  name: string;
  type: string;
}

interface GenerationOptions {
  source: 'api' | 'json' | 'csv';
  url?: string;
  file?: string;
  jsonInput?: string; // Kept for CLI mode, but not used in interactive JSON flow
  output: 'typescript' | 'jsonschema';
  interfaceName: string;
  inferOptional: boolean;
  prettify: boolean;
  outFile?: string;
  customFields?: CustomField[];
  verbose?: boolean;
}

// Corrected dedupeUnions to accept prettify option
function dedupeUnions(text: string, format: 'typescript' | 'jsonschema', prettify: boolean): string {
  if (format === 'typescript') {
    let dedupedText = text;
    let previousText = "";
    do {
        previousText = dedupedText;
        dedupedText = dedupedText.replace(/(\b\w+(?:\[\])?\b)\s*\|\s*\1(?!\w)/g, '$1');
        dedupedText = dedupedText.replace(/(\b\w+(?:\[\])?\b)\s*\|\s*(\b\w+(?:\[\])?\b)/g, (match, p1, p2) => {
            return p1.localeCompare(p2) > 0 ? `${p2} | ${p1}` : match;
        });
    } while (previousText !== dedupedText);
    return dedupedText;
  }
  try {
    const obj = JSON.parse(text);
    function walk(node: any) {
      if (node && typeof node === 'object') {
        if (Array.isArray(node.anyOf)) {
          const seen = new Set<string>();
          node.anyOf = node.anyOf.filter((sub: any) => {
            const key = JSON.stringify(sub);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          if (node.anyOf.length === 1) {
            Object.assign(node, node.anyOf[0]);
            delete node.anyOf;
          }
        }
        Object.values(node).forEach(walk);
      }
    }
    walk(obj);
    // Use the passed prettify argument here
    return JSON.stringify(obj, null, prettify ? 2 : undefined);
  } catch (e) {
    return text;
  }
}

async function processGeneration(opts: GenerationOptions) {
  spinner.start();
  let data: SchemaType;
  try {
    switch (opts.source) {
      case 'json':
        if (opts.jsonInput && !opts.file) { // CLI might use jsonInput
          data = parseJsonString(opts.jsonInput);
        } else if (opts.file) {
          data = await parseJsonFile(opts.file);
        } else {
          throw new Error('JSON source selected but no input file was provided.');
        }
        break;
      case 'api':
        if (!opts.url) throw new Error('API source selected but no URL was provided.');
        data = await parseApiResponse(opts.url);
        break;
      case 'csv':
        if (!opts.file) throw new Error('CSV source selected but no file path was provided.');
        data = await parseCsvFile(opts.file);
        break;
      default:
        throw new Error(`Invalid data source: ${opts.source}`);
    }

    if (opts.customFields && opts.customFields.length > 0) {
      if (data.type !== 'object') {
        console.warn(chalk.yellow("Custom fields can only be added to an object-based schema. Current base schema is not an object. Ignoring custom fields."));
      } else {
        if (!data.properties) {
          data.properties = {};
        }
        opts.customFields.forEach(field => {
          let fieldSchemaType: SchemaType;
          if (field.type.startsWith('array_')) {
              const itemType = field.type.split('_')[1];
              fieldSchemaType = { type: 'array', items: { type: itemType } as SchemaType };
          } else if (field.type === 'object') {
              fieldSchemaType = { type: 'object', properties: {} };
          } else {
            fieldSchemaType = { type: field.type } as SchemaType;
          }
          data.properties![field.name] = fieldSchemaType;
        });
      }
    }

    let outputText = '';
    const generatorOptions = {
      inferOptional: opts.inferOptional,
      interfaceName: opts.interfaceName,
      prettify: opts.prettify,
    };

    if (opts.output === 'typescript') {
      outputText = await generateTypeScript(data, generatorOptions as TSGenerateOptions);
    } else {
      outputText = generateJsonSchema(data, generatorOptions as JsonSchemaGenerateOptions);
    }

    // Pass opts.prettify to dedupeUnions
    outputText = dedupeUnions(outputText, opts.output, opts.prettify);

    if (opts.outFile) {
      // Ensure directory exists before writing
      const dirName = path.dirname(opts.outFile);
      if (dirName && dirName !== '.') { // Avoid trying to create current dir or root
        fs.mkdirSync(dirName, { recursive: true });
      }
      fs.writeFileSync(opts.outFile, outputText, 'utf-8');
      spinner.success({ text: `Output generated!` });
      console.log(chalk.green(`\nOutput successfully written to ${opts.outFile}`));
    } else {
      spinner.success({ text: `Output generated!` });
      console.log(`\n${outputText}`);
    }

  } catch (error: any) {
    spinner.error({ text: `Failed to generate output!` });
    console.error(chalk.red(`\nError during processing:`));
    console.error(chalk.red(`  Message: ${error.message}`));
    if (opts.verbose && error.stack) {
      console.error(chalk.grey(error.stack));
    }
    throw error;
  }
}

async function runInteractive() {
  console.log(chalk.bold.cyan('Welcome to TypeInfer - Interactive Mode'));
  const opts: Partial<GenerationOptions> = {};

  try {
    const { sourceChoice } = await inquirer.prompt<{ sourceChoice: 'API' | 'JSON' | 'CSV' }>([
        {
            type: 'list',
            name: 'sourceChoice',
            message: 'Select data source type:',
            choices: ['API', 'JSON', 'CSV']
        }
    ]);
    opts.source = sourceChoice.toLowerCase() as 'api' | 'json' | 'csv';

    if (opts.source === 'json') {
      // If JSON is selected, directly ask for the file path
      const { file } = await inquirer.prompt<{ file: string }>([
          {
              type: 'input',
              name: 'file',
              message: 'Enter JSON file path:',
              validate: (input: string) => input.trim() !== '' || 'File path cannot be empty.'
          }
      ]);
      opts.file = file;
      opts.jsonInput = undefined; // Ensure jsonInput is not set from a previous CLI attempt or other flow
    } else if (opts.source === 'api') {
      const { url } = await inquirer.prompt<{ url: string }>([
          {
              type: 'input',
              name: 'url',
              message: 'Enter API endpoint URL:',
              validate: (input: string) => input.trim() !== '' || 'API URL cannot be empty.'
          }
      ]);
      opts.url = url;
    } else { // CSV
      const { file } = await inquirer.prompt<{ file: string }>([
          {
              type: 'input',
              name: 'file',
              message: 'Enter CSV file path:',
              validate: (input: string) => input.trim() !== '' || 'File path cannot be empty.'
          }
      ]);
      opts.file = file;
    }

    const { outputChoice } = await inquirer.prompt<{ outputChoice: 'TypeScript' | 'JSONSchema' }>([
        {
            type: 'list',
            name: 'outputChoice',
            message: 'Select output format:',
            choices: ['TypeScript', 'JSONSchema']
        }
    ]);
    opts.output = outputChoice.toLowerCase() as 'typescript' | 'jsonschema';

    const { interfaceName } = await inquirer.prompt<{ interfaceName: string }>([
        {
            type: 'input',
            name: 'interfaceName',
            message: opts.output === 'typescript' ? 'Interface name:' : 'Schema title:',
            default: 'Generated'
        }
    ]);
    opts.interfaceName = interfaceName;

    const { inferOptionalChoice } = await inquirer.prompt<{ inferOptionalChoice: 'Yes' | 'No' }>([
        {
            type: 'list',
            name: 'inferOptionalChoice',
            message: 'Infer optional properties (fields not present in all objects/samples become optional)?',
            choices: ['Yes', 'No'],
            default: 'No'
        }
    ]);
    opts.inferOptional = inferOptionalChoice === 'Yes';

    const { addCustomFieldsChoice } = await inquirer.prompt<{ addCustomFieldsChoice: 'Yes' | 'No' }>([
        {
            type: 'list',
            name: 'addCustomFieldsChoice',
            message: 'Do you want to define additional custom fields in the schema?',
            choices: ['Yes', 'No'],
            default: 'No',
        }
    ]);

    if (addCustomFieldsChoice === 'Yes') {
      const { numFields } = await inquirer.prompt<{ numFields: number }>([
          {
              type: 'input',
              name: 'numFields',
              message: 'How many additional fields do you want to add?',
              validate: (input: string) => {
                  const num = parseInt(input, 10);
                  return (!isNaN(num) && num > 0) || 'Please enter a positive number.';
              },
              filter: (input: string) => parseInt(input, 10)
          }
      ]);

      opts.customFields = [];
      const availableTypes = ['string', 'number', 'boolean', 'object', 'array_string', 'array_number', 'array_boolean', 'array_object'];
      for (let i = 0; i < numFields; i++) {
          const { fieldName } = await inquirer.prompt<{ fieldName: string }>([
              {
                  type: 'input',
                  name: 'fieldName',
                  message: `Enter name for additional field ${i + 1}:`,
                  validate: (input: string) => input.trim() !== '' || 'Field name cannot be empty.'
              }
          ]);

          const { fieldType } = await inquirer.prompt<{ fieldType: string }>([
              {
                  type: 'list',
                  name: 'fieldType',
                  message: `Select data type for field '${fieldName}':`,
                  choices: availableTypes
              }
          ]);
          opts.customFields.push({ name: fieldName, type: fieldType });
      }
    }

    const { prettifyChoice } = await inquirer.prompt<{ prettifyChoice: 'Yes' | 'No' }> ([
        {
            type: 'list',
            name: 'prettifyChoice',
            message: 'Prettify output?',
            choices: ['Yes', 'No'],
            default: 'Yes'
        }
    ]);
    opts.prettify = prettifyChoice === 'Yes';

    const { wantFile } = await inquirer.prompt<{ wantFile: 'Yes' | 'No' }> ([
        {
            type: 'list',
            name: 'wantFile',
            message: 'Save to a new file?',
            choices: ['Yes', 'No'],
            default: 'No'
        }
    ]);
    if (wantFile === 'Yes') {
      const { outFile } = await inquirer.prompt<{ outFile: string }> ([
          {
              type: 'input',
              name: 'outFile',
              message: 'Output file path:',
              validate: (input: string) => input.trim() !== '' || 'Output file path cannot be empty.'
          }
      ]);
      opts.outFile = outFile;
    }

    await processGeneration(opts as GenerationOptions);

  } catch (error: any) {
    console.error(chalk.red(`\nAn unexpected error occurred in interactive mode:`));
    console.error(chalk.red(`  Message: ${error.message}`));
    if (opts.verbose && error.stack) {
      console.error(chalk.grey(error.stack));
    }
    console.log(chalk.yellow('\nExiting interactive mode due to error.'));
    process.exit(1);
  }
}

const program = new Command();
program
  .name('typeinfer')
  .version('1.0.3') // Incremented version
  .option('-s, --source <type>', 'Data source type (api, json, csv)')
  .option('-u, --url <url>', 'API endpoint URL for API source')
  .option('-f, --file <path>', 'File path for CSV or JSON source')
  .option('-j, --json-input <json>', 'Direct JSON input string (for CLI usage)')
  .option('-o, --output <format>', 'Output format (typescript, jsonschema)', 'typescript')
  .option('-i, --interfaceName <name>', 'Name for the generated interface/schema title', 'Generated')
  .option('--inferOptional', 'Infer optional properties', false)
  .option('--customFields <jsonstring>', 'Define additional custom fields as a JSON string (e.g., \'[{"name":"newField","type":"string"}]\')')
  .option('-p, --prettify', 'Prettify output', false)
  .option('--outFile <path>', 'Output file path (outputs to console if not specified)')
  .option('--verbose', 'Enable verbose error logging (shows stack trace)', false)
  .action(async (cmdOpts) => {
    const rawArgs = process.argv.slice(2);
    const relevantArgs = rawArgs.filter(arg => !['--verbose'].includes(arg));

    if (relevantArgs.length === 0) {
         await runInteractive();
    } else {
      const options: GenerationOptions = {
        source: cmdOpts.source,
        url: cmdOpts.url,
        file: cmdOpts.file,
        jsonInput: cmdOpts.jsonInput,
        output: cmdOpts.output ? cmdOpts.output.toLowerCase() : 'typescript',
        interfaceName: cmdOpts.interfaceName || 'Generated',
        inferOptional: !!cmdOpts.inferOptional,
        prettify: !!cmdOpts.prettify,
        outFile: cmdOpts.outFile,
        verbose: !!cmdOpts.verbose,
        customFields: cmdOpts.customFields ? JSON.parse(cmdOpts.customFields) : undefined
      };

      // CLI mode validation
      let  isCliModeInvalid = false;
      if (options.source === 'json' && !options.file && !options.jsonInput) {
        console.error(chalk.red('Error: For JSON source via CLI, provide a file path (-f) or direct input (-j).'));
        isCliModeInvalid = true;
      } else if (options.source === 'api' && !options.url) {
        console.error(chalk.red('Error: For API source via CLI, provide an API URL (-u).'));
        isCliModeInvalid = true;
      } else if (options.source === 'csv' && !options.file) {
         console.error(chalk.red('Error: For CSV source via CLI, provide a file path (-f).'));
         isCliModeInvalid = true;
      } else if (!options.source) {
         // This case means some flags were passed but not -s
         // If other flags like -f or -u were passed, it implies CLI mode.
         const hasOtherCliFlags = options.file || options.url || options.jsonInput || options.output !== 'typescript' || options.interfaceName !== 'Generated';
         if (hasOtherCliFlags) {
            console.error(chalk.red('Error: Source type (-s, --source) is required for CLI mode.'));
            isCliModeInvalid = true;
         } else {
            // Not enough info for CLI, and relevantArgs wasn't empty, likely just --verbose or similar.
            // This should ideally be caught by relevantArgs.length === 0, but as a safeguard:
            await runInteractive();
            return;
         }
      }

      if (isCliModeInvalid) {
          program.help();
          process.exit(1);
      }

      try {
        await processGeneration(options);
      } catch (error) {
        process.exit(1);
      }
    }
  });

// Determine if running in interactive mode or CLI mode
if (process.argv.length <= 2) { // No arguments, or just 'node' and script name
    runInteractive();
} else {
    // Check if only '--verbose' is passed, if so, still run interactive
    const relevantArgs = process.argv.slice(2).filter(arg => arg !== '--verbose');
    if (relevantArgs.length === 0 && process.argv.slice(2).includes('--verbose')) {
        // Set verbose for interactive mode if desired, then run.
        // This part is tricky because `opts` isn't available here yet.
        // For simplicity, if only --verbose, let the .action handler decide.
        // The .action handler will see relevantArgs.length === 0 and call runInteractive.
        // The verbose flag would be for CLI mode's processGeneration.
        // If you need --verbose to affect runInteractive's error logging,
        // `opts.verbose` would need to be set before its try-catch.
        program.parse(process.argv); // Let action handle it.
    } else if (relevantArgs.length > 0) {
        program.parse(process.argv); // Parse arguments for CLI mode
    } else {
        runInteractive(); // Fallback if somehow not caught (e.g. only --verbose, handled by action)
    }
}