# API Design Demo

A bare-bones Node.js TypeScript project for demonstrating API design concepts using only Node.js built-in fetch.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Build the project:

```bash
npm run build
```

3. Run the demo:

```bash
npm start
```

Or build and run in one step:

```bash
npm run dev
```

## Project Structure

```
├── src/
│   └── index.ts          # Main demo file with API client example
├── dist/                 # Compiled JavaScript output
├── package.json          # Project configuration
├── tsconfig.json         # TypeScript configuration
└── README.md            # This file
```

## What it demonstrates

- **API Client Pattern**: Simple class-based HTTP client
- **TypeScript Generics**: Type-safe API responses
- **Error Handling**: HTTP error management
- **Modern JavaScript**: ES modules, async/await, fetch API

## Requirements

- Node.js >= 18.0.0 (for built-in fetch support)
- TypeScript (installed as dev dependency)
