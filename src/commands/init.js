import path from 'path';
import readline from 'readline';
import { configExists, writeConfig, emptyConfig, setFileEntry } from '../lib/config.js';

export async function init(options) {
  if (configExists()) {
    console.error('.gdocs-sync.json already exists in this directory.');
    process.exit(1);
  }

  if (options.docId) {
    const file = await prompt('Which local file should map to this doc? (e.g. spec.md): ');
    if (!file) {
      console.error('A filename is required.');
      process.exit(1);
    }
    writeConfig(emptyConfig());
    setFileEntry(path.basename(file), {
      docId: options.docId,
      docUrl: `https://docs.google.com/document/d/${options.docId}/edit`,
    });
    console.log(`Mapped ${path.basename(file)} → https://docs.google.com/document/d/${options.docId}/edit`);
  } else {
    writeConfig(emptyConfig());
    console.log('Created .gdocs-sync.json');
    console.log('Run `gdocs push <file>` to create a Google Doc and link it.');
  }
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
