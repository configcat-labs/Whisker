# 🐱 Whisker

Whisker is a VS Code extension that validates ConfigCat blog articles and helps you tag them correctly.

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

## For Developers

To build a new `.vsix` after making changes:

```bash
npm install
npm run compile
npx vsce package --allow-missing-vsce-ignore
```

Commit the new `.vsix` to the repo so writers can download it.
