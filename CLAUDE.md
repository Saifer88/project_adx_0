# ADX Framework - Claude Context

## Project Overview
This is the ADX (Agent-Driven Experience) Framework - a frontend framework built specifically for AI coding agents to minimize token consumption while maintaining human comprehensibility.

## Key Directories
- `src/` - The ADX compiler (TypeScript)
- `fixtures/` - Example components (UserCard, site examples)
- `docs/` - Comprehensive documentation (agent-reference.md, human-guide.md, etc.)
- `dist/` - Built compiler output
- `test/` - Test suites
- `benchmark/` - Token benchmarking tools
- `tokens/` - Design tokens configuration

## Core Philosophy (Token-First Design)
1. Every syntax decision optimized for minimal token cost for AI agents
2. Flat & explicit structure - no magic, everything traceable
3. Modular separation: structure (.adx), behavior (.adx.js), style (.adx.css)
4. API-driven manipulation via simple JSON/YAML operations
5. Quality by default with integrated UX/UI patterns
6. Documentation optimized for LLM context windows

## Component Structure
Each component consists of 4 files:
- `structure.adx` - DOM structure (compact HTML-like syntax)
- `behavior.adx.js` - Logic (pure functions)
- `style.adx.css` - Styling (using semantic design tokens)
- `manifest.json` - Component metadata & API definition

## Development Commands
- `npm install` - Install dependencies
- `npm run build` - Build TypeScript to dist/
- `npm test` - Run Vitest test suites
- `npm run lint` - Run ESLint
- `npm run benchmark` - Run token efficiency benchmark (dev-only)
- `adx build <dir>` - Build component (after npm run build)
- `adx check <dir>` - Validate component (after npm run build)

## Current Status (from README)
- Version: 0.1.0-alpha
- Milestone 2 Shipped: Real data binding, multi-component pages, component composition + slots, reactivity contract, measured token benchmark
- Next: Pattern library, dev server + hot reload, CLI enhancements (create/tokens/pattern commands)

## Working with This Project
As an AI agent, you should:
1. Start with `docs/agent-reference.md` for token-efficient reference
2. Understand the component structure before making changes
3. Focus on token-efficient modifications when possible
4. Use the established patterns rather than building from scratch
5. Ensure any changes maintain the token-first design principle

The compiler is located in `src/` with entry point `src/cli.ts` → `src/compile.ts`.