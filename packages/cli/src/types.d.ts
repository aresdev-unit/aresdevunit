declare module 'inquirer' {
  interface PromptQuestion {
    type: string;
    name: string;
    message: string;
    default?: unknown;
    choices?: Array<{ name: string; value: string } | string>;
    validate?: (input: unknown) => boolean | string;
  }

  interface Inquirer {
    prompt<T = Record<string, unknown>>(questions: PromptQuestion[]): Promise<T>;
  }

  const inquirer: Inquirer;
  export = inquirer;
}
