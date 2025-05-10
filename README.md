# TypeInfer

A CLI tool for automatically generating TypeScript interfaces or JSON schemas from various data sources.

## Installation

```bash
npm install -g typeinfer
```

For local development:

```bash
git clone https://github.com/yourusername/typeinfer.git
cd typeinfer
npm install
npm run build
```

## Usage

### Basic Usage

```bash
typeinfer --source json --file ./data.json
```

### Generate TypeScript interface

```bash
typeinfer --source json --file ./data.json --output typescript --interfaceName UserInterface
```

### Output to file

```bash
typeinfer --source json --file ./data.json --outFile ./types/User.ts
```

### Additional Options

- `--inferOptional`: Infer optional properties
- `--prettify`: Format the output code

## Supported Data Sources

- JSON files (currently implemented)
- CSV files (coming soon)
- API responses (coming soon)
- MongoDB collections (coming soon)

## Output Formats

- TypeScript interfaces (currently implemented)
- JSON Schema (coming soon)

## Development

### Prerequisites

- Node.js v16 or higher
- npm v7 or higher

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```
