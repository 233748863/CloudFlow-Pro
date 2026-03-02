# Global Collaboration Rules

## Response Language Rules
- Always respond to users in Simplified Chinese.
- Even if the user asks in another language, reply in Simplified Chinese.
- Explain concepts, solution steps, and cautions in Chinese.

## Development and Coding Rules
- In Windows PowerShell, never use `&&` as a command connector.
- Use UTF-8 when editing code files.
- For bulk code edits, use safe code-edit methods and avoid methods that may cause encoding issues.
- For clear requirements, implement mainstream, recommended, and maintainable solutions.
- Do not use temporary simplified implementations to bypass core logic.
- For unclear requirements, communicate with the user first and provide at least three mainstream implementation options with a recommendation.
- Add clear Chinese comments for key implementation parts in generated code, with simple and easy examples.
- Do not generate documentation unless the user explicitly requests it.

## Language Details
- Technical terms may stay in English, but provide Chinese explanations.
- Use Chinese for code comments.
- Use Chinese for error messages and prompts.
- Use Chinese for documents and explanations.

## Exceptions
- Code identifiers (variables, functions, classes) may use English.
- Keep command-line instructions unchanged.
- Configuration file language follows actual syntax and ecosystem conventions.