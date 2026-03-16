# gdocs-sync

Sync local markdown files to Google Docs and back. Write locally, collaborate in Google Docs.

## Features

- Push local markdown to Google Docs
- Pull content and comments back to local files
- Lazy doc creation — first push creates the doc automatically
- Token-based auth — authenticate once, run forever

## Installation

```bash
npm install -g gdocs-sync
```

## Google Cloud Setup (one-time)

Before using gdocs-sync, you need to configure a Google Cloud project:

### 1. Create a Google Cloud Project

Go to [https://console.cloud.google.com](https://console.cloud.google.com) and create a new project.

### 2. Enable Required APIs

Enable both APIs for your project:

- **Google Drive API**: https://console.developers.google.com/apis/api/drive.googleapis.com/overview
- **Google Docs API**: https://console.developers.google.com/apis/api/docs.googleapis.com/overview

Click **Enable** for each.

### 3. Configure the OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External** and click **Create**
3. Fill in the required fields (app name, support email)
4. Click **Save and Continue** through the remaining steps

### 4. Add Test Users

Since the app is in testing mode, you must whitelist each user:

1. Go to **APIs & Services → OAuth consent screen**
2. Scroll down to **Test users**
3. Click **Add users**
4. Add the Gmail addresses of anyone who will use the tool
5. Click **Save**

> Once you publish the app and complete Google's verification, this step won't be needed.

### 5. Create OAuth Credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Choose **Desktop app**
4. Download the credentials

### 6. Set Environment Variables

Add your client ID and secret to `~/.zshrc` (or `~/.bashrc`):

```bash
echo 'export GDOCS_CLIENT_ID="your-client-id"' >> ~/.zshrc
echo 'export GDOCS_CLIENT_SECRET="your-client-secret"' >> ~/.zshrc
source ~/.zshrc
```

## Usage

### Authenticate (once per machine)

```bash
gdocs auth
```

This opens your browser, asks you to approve access, and saves a token to `~/.gdocs/token.json`.

### Initialize a project

```bash
cd your-project
gdocs init
```

### Push a file to Google Docs

```bash
gdocs push spec.md
```

On first push, a new Google Doc is created and its ID is saved to `.gdocs-sync.json`. Subsequent pushes update the same doc.

### Pull content and comments back

```bash
gdocs pull spec.md
```

## How it works

- `.gdocs-sync.json` — stores the mapping of local files to Google Doc IDs (per project)
- `~/.gdocs/token.json` — stores your OAuth token (per machine, never committed)

## Contributing

PRs welcome. MIT licensed.
