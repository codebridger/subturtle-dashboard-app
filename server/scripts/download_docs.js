const fs = require('fs');
const path = require('path');
const TurndownService = require('turndown');
const { JSDOM } = require('jsdom');

const docs = [
  {
    name: 'server',
    url: 'https://modular-rest.github.io/modular-rest/server-client-ts/llm-context.html',
    path: '../../.agent/modular-rest/modular-rest_server.md',
    turndown: true,
  },
  {
    name: 'client',
    url: 'https://modular-rest.github.io/modular-rest/js-client/llm-context.html',
    path: '../../.agent/modular-rest/modular-rest_client.md',
    turndown: true,
  },
  {
    name: 'llm',
    url: 'https://codebridger.github.io/lib-vue-components/llm.md',
    path: '../../.agent/modular-rest/lib-vue-components.md',
    turndown: false,
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
      const resContent = await response.text();
      
      const dom = new JSDOM(resContent);
      const document = dom.window.document;
      
      const content = document.querySelector('.vp-doc') || document.querySelector('main') || document.body;
      const markdown = doc.turndown ? turndownService.turndown(content.innerHTML) : resContent;
      
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
