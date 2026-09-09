declare module 'mammoth/mammoth.browser' {
  interface ConversionResult {
    value: string;
    messages: unknown[];
  }

  interface ConvertOptions {
    arrayBuffer?: ArrayBuffer;
  }

  function convertToHtml(options: ConvertOptions): Promise<ConversionResult>;
  function convertToMarkdown(options: ConvertOptions): Promise<ConversionResult>;
}
