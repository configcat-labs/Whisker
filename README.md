# 🐱 Whisker

A VS Code extension for our content writers that validates and shows approved tags for ConfigCat blog articles.

## Installing

1. Download the latest `whisker-x.x.x.vsix` file from this repo
2. Open VS Code
3. Go to the Extensions panel (`Cmd+Shift+X` on Mac, `Ctrl+Shift+X` on Windows)
4. Click the `...` menu in the top right of the Extensions panel
5. Select **Install from VSIX...** and choose the downloaded file
6. Reload VS Code when prompted

## Using Whisker

Open any blog `.md` file and Whisker will automatically run. Look for the **🐱 Whisker** indicator in the bottom status bar — it shows error and warning counts at a glance.

Click it to open the Whisker panel, which has three tabs:

- **Errors** — things that must be fixed before publishing (missing fields, invalid tags, etc.)
- **Warnings** — things worth reviewing (description length, image attributes, etc.)
- **Tags** — browse all available tags by category and add them with one click

Whisker re-runs automatically every time you save the file.

## Screenshots

<img width="1080" alt="Whisker" src="https://github.com/user-attachments/assets/29a2b894-e1f7-4a11-a44e-d77a3b876256" />

## For Developers

To build a new `.vsix` after making changes:

```bash
npm install
npm run compile
npm run package
```

Commit the new `.vsix` to the repo so writers can download it.
