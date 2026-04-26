# Contributing

We welcome contributions! Please follow these guidelines:

## Development Setup

1. Clone the repo and install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in the values
3. Start the dev server: `npm run dev`
4. Run tests: `npm test`

## Code Quality

- Run `npm run code-check` before committing (Biome lint + format + TypeScript)
- Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/)
- Pre-commit hooks enforce formatting and commit message validation

## Pull Requests

- Branch from `main`
- Include tests for new functionality
- Ensure all tests pass: `npm test`
- Ensure code checks pass: `npm run code-check`

## Architecture

Business logic lives in `src/domain/` and is tested independently of the framework.
Server functions in `src/serverFunctions/` are thin wrappers that handle auth and call domain functions.
See `README.md` for the full architecture overview.
