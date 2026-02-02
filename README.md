# TubeZenify

TubeZenify is a Chrome Extension that transforms your YouTube sidebar into a "Zen" interface. It allows you to organize your subscriptions into nested folders, focus on what matters, and sync your organization across devices.

## Features

- **Zen Interface**: A clean, distraction-free side panel replacing the default YouTube sidebar.
- **Folder Organization**: Create nested folders and organize your channels via drag-and-drop.
- **Inbox System**: A dedicated section for uncategorized channels to keep your folder structure clean.
- **Dark Mode**: Automatically adapts to your system's color theme.
- **Data Sync**: Syncs folder structure across devices (see limitations below).
- **Import/Export**: Manually backup and transfer your folder settings.

## Permissions

- **`sidePanel`**: Required to display the custom folder interface within the browser's side panel.
- **`storage`**: Necessary to store your folder structure and extension settings.
- **`*://*.youtube.com/*`**: Used to integrate seamlessly with YouTube, allowing the extension to detect navigation and enhance the user interface on YouTube pages only.

## Data Sync & Security

TubeZenify leverages your browser's built-in sync capabilities (`chrome.storage.sync`) to keep your folder structure consistent across devices.

### ✅ What Syncs Automatically

- **Same Browser & Account**: Your folder structure syncs automatically if you use Chrome on multiple computers and are signed in with the same Google account.
  **To ensure sync works:**
  1. Open `chrome://settings/syncSetup`.
  2. Ensure **Sync is On**.
  3. Verify that **Extensions** are checked in the sync settings.

### ⚠️ What Does Not Sync Automatically

- **Different Accounts**: Data does not sync between different Google accounts.
- **Channel Metadata**: Channel names and icons are cached locally on each device to ensure speed and privacy. They are re-fetched when you open YouTube on that device.

### 🛡️ Security & Privacy

- **Local-First**: If you do not have browser sync enabled (e.g., signed out of Chrome), your data is stored **only on your specific device**. It is never sent to any external server.
- **No Third-Party Cloud**: TubeZenify does not use any proprietary servers. Your data stays within your browser's ecosystem.

### 🔄 Manual Import/Export

To transfer your settings between different browsers:

1. Click the **Settings (Gear)** icon in the extension header.
2. Select **"Export Settings"** to download a JSON file.
3. On the other browser, select **"Import Settings"** and choose the downloaded file.

## Development

This project is built with React + Vite.

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Perform initial build:**
   ```bash
   npm run build
   ```
   This generates the initial `dist` folder required for the extension to be recognized by the browser.

3. **Load the extension into your browser:**
   - Open Google Chrome.
   - Go to the extensions management page (`chrome://extensions`).
   - Turn on **Developer mode**.
   - Click **Load unpacked** and select the `dist` folder.

4. **Start development mode (HMR):**
   ```bash
   npm run dev
   ```
   Keep this command running while developing. Changes to your code will be reflected in the extension automatically.

## Authors

- **phine-apps** - [GitHub](https://github.com/phine-apps)

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0) - see the [LICENSE](LICENSE) file for details.
