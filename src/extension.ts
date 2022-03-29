import { commands, ExtensionContext, window, workspace, ProgressLocation, Uri, extensions } from 'vscode';
import axios from 'axios';
import { join } from 'path';
import { unlinkSync, writeFileSync } from 'fs';
import { Logger } from './Logger';
import { CronJob } from 'cron';

export function activate(context: ExtensionContext) {
	const logger = new Logger('Extension Installer');
	const {subscriptions} = context;

	subscriptions.push(
		commands.registerCommand('extensionInstaller.backgroundCheck', async () => {
			const apiUrls = workspace.getConfiguration(`extensionInstaller`).get<string[]>(`apiUrls`);

			if (!apiUrls || !apiUrls.length) {
				return;
			}

			for (const apiUrl of apiUrls) {
				const response = await axios.get(apiUrl);

				const { id, displayName, name, version: { major, minor, patch }} = response.data;
				const exts = extensions.all;
				const crntExt = exts.find(ext => ext.id.toLowerCase() === id.toLowerCase());

				const extVersion = crntExt?.packageJSON?.version;
				if (extVersion === `${major}.${minor}.${patch}`) {
					logger.info(`${displayName} is up to date`);
					continue;
				}

				const shouldIgnore = context.globalState.get(`${id}-${extVersion}-ignore`);
				if (!shouldIgnore) {
					const choice = await window.showInformationMessage(`A newer version of the ${displayName || id || name} extension is available.`, `Update`, `Ignore`);
	
					if (choice === `Update`) {
						await commands.executeCommand(`extensionInstaller.checkForUpdates`);
					} else if (choice === "Ignore") {
						await context.globalState.update(`${id}-${extVersion}-ignore`, true);
					}
				}
			}
		})
	);

	subscriptions.push(
		commands.registerCommand('extensionInstaller.checkForUpdates', async () => {
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

							window.showInformationMessage(`Extension Installer: Great news! ${response.data.name} got installed.`, 'Reload window').then(async (result) => {
								if (result === 'Reload window') {
									await commands.executeCommand('workbench.action.reloadWindow');
								}
							});
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
		})
	);

	const job = new CronJob(`0 */1 * * *`, () => {
		logger.info(`Running background check`);
		commands.executeCommand(`extensionInstaller.backgroundCheck`);
	});
	job.start();
}

// this method is called when your extension is deactivated
export function deactivate() {}
