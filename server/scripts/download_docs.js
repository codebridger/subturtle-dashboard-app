const fs = require('fs');
const path = require('path');
const TurndownService = require('turndown');
const { JSDOM } = require('jsdom');

const docs = [
  {
    name: 'server',
    url: 'https://modular-rest.github.io/modular-rest/server-client-ts/llm-context.html',
    path: '../../.agent/modular-rest/server.md'
  },
  {
    name: 'client',
    url: 'https://modular-rest.github.io/modular-rest/js-client/llm-context.html',
    path: '../../.agent/modular-rest/client.md'
  }
];

async function downloadDocs() {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
  });

  for (const doc of docs) {
    try {
      console.log(`Downloading and converting ${doc.name} from ${doc.url}...`);
      const response = await fetch(doc.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${doc.url}: ${response.statusText}`);
      }
      const html = await response.text();
      
      const dom = new JSDOM(html);
      const document = dom.window.document;
      
      const content = document.querySelector('.vp-doc') || document.querySelector('main') || document.body;
      const markdown = turndownService.turndown(content.innerHTML);
      
      const targetPath = path.resolve(__dirname, doc.path);
      const dir = path.dirname(targetPath);
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(targetPath, markdown);
      console.log(`Successfully saved ${doc.name} as Markdown at ${doc.path}`);
    } catch (error) {
      console.error(`Error processing ${doc.name}:`, error.message);
    }
  }
}

downloadDocs();
