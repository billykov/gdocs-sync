#!/usr/bin/env node

import { program } from 'commander';
import { auth } from '../src/commands/auth.js';
import { init } from '../src/commands/init.js';
import { push } from '../src/commands/push.js';
import { pull } from '../src/commands/pull.js';

program
  .name('gdocs')
  .description(
    'Sync local Markdown files to Google Docs and back.\n\n' +
    'Quick start:\n' +
    '  gdocs auth          Authenticate with Google (once per machine)\n' +
    '  gdocs init          Initialize the current directory\n' +
    '  gdocs push notes.md Create/update a Google Doc from notes.md\n' +
    '  gdocs pull notes.md Pull content and comments back to notes.md'
  )
  .version('0.1.0');

program
  .command('auth')
  .description('Authenticate with Google via OAuth2 (opens browser, saves token to ~/.gdocs/token.json)')
  .action(auth);

program
  .command('init')
  .description('Initialize gdocs-sync in the current directory (creates .gdocs-sync.json)')
  .option('--doc-id <id>', 'Link to an existing Google Doc instead of creating a new one')
  .action(init);

program
  .command('push <file>')
  .description('Push a local Markdown file to Google Docs (creates the doc on first push)')
  .action(push);

program
  .command('pull <file>')
  .description('Pull content and comments from Google Docs to the local file (writes <file>.comments.md)')
  .action(pull);

program.parse();
