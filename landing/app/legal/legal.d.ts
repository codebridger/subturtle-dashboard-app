// The `?html` loader in nuxt.config.ts turns a Markdown file into its rendered HTML string.
declare module '*.md?html' {
    const html: string;
    export default html;
}
