import { commands, ExtensionContext, window, workspace, ProgressLocation, Uri } from 'vscode';
import axios from 'axios';
import { join } from 'path';
import { unlinkSync, writeFileSync } from 'fs';
import { Logger } from './Logger';

const link = `https://internal-vscode-vsix.vercel.app/vscode-rapidapi-client-0.0.1999410.vsix`;

export function activate(context: ExtensionContext) {
	const logger = new Logger('Extension Installer');

	let disposable = commands.registerCommand('extensionInstaller.checkForUpdates', async () => {
		const apiUrls = workspace.getConfiguration(`extensionInstaller`).get<string[]>(`apiUrls`);

		if (!apiUrls || !apiUrls.length) {
			window.showWarningMessage(`Extension Installer: No API Urls found in the settings.`);
			logger.error(`No API Urls found in the settings.`);
			return;
		}
		
		window.withProgress({
			location: ProgressLocation.Notification,
			cancellable: false,
			title: `Extension Installer: Checking for updates...`
		}, async () => {
			logger.info(`Checking for updates with the following API Urls: ${apiUrls.join(', ')}`);

			for (const apiUrl of apiUrls) {
				try {
					let crntFilePath = "";
					const response = await axios.get(apiUrl);
					
					if (response.status !== 200) {
						logger.warning(`API Url ${apiUrl} returned a status code of ${response.status}`);
						continue;
					}

					logger.info(`Installing latest version of ${response.data.name}`);
					const downloadUrl = response.data.download;

					const pkgResponse = await axios({
						url: downloadUrl,
						method: 'GET',
						responseType: 'arraybuffer',
					});

					if (pkgResponse.status === 200) {
						crntFilePath = join(context.extensionPath, response.data.name);
						writeFileSync(crntFilePath, pkgResponse.data, { encoding: null });
						await commands.executeCommand('workbench.extensions.installExtension', Uri.file(crntFilePath));

						window.showInformationMessage(`Extension Installer: Great news! ${response.data.name} got installed.`);
						logger.info(`Great news! ${response.data.name} got installed.`);
					} else {
						window.showErrorMessage(`Extension Installer: Failed to fetch package - ${response.data.name}`);
						logger.error(`Extension Installer: Failed to fetch package - ${response.data.name}`);
					}

					// Delete file
					if (crntFilePath) {
						unlinkSync(crntFilePath);
					}
				} catch (e) {
					logger.error(`Something went wrong during the fetch/installation logic - ${(e as Error).message}`);
				}
			}
		});
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
