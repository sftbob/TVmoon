// opencc-js ships a CommonJS runtime for this subpath, but its shared type
// declarations are marked ESM. Describe the used API for TypeScript 4.9/Node16.
declare module 'opencc-js/t2cn' {
  export function Converter(options: {
    from: 'tw';
    to: 'cn';
  }): (text: string) => string;
}
